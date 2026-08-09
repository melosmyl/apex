// freeMeetingGate — Phase 4.1. The only thing standing between an anonymous
// visitor and an expensive multi-advisor board debate. Everything after a
// successful 'check' reuses the exact same code real founders use
// (generateOnboardingPlan, createCompanyFromOnboarding, startBoardMeeting,
// runBoardDiscussion, runChairSynthesis) — RLS already caps an anonymous
// session to one company and one meeting, so this function's job is purely
// the free-meeting-specific protections: rate limiting, the daily spend
// ceiling, refusing a second free meeting, and logging enough per attempt
// (hashed IP, completed, actual cost) to tell demand from abuse later.
//
// Two actions:
//   'check'    — call before starting anything. Returns eligible:true and
//                an attempt_id to proceed, or eligible:false with a plain
//                closed-door message.
//   'complete' — call once the meeting result exists. Sums this session's
//                real cost from ai_usage_logs and closes out the attempt.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CLOSED_MESSAGE = "We've reached today's limit for free board meetings — each one costs real money to run. Come back tomorrow, or create an account to start your own board now.";
const ALREADY_USED_MESSAGE = "You've already used your free board meeting.";

async function hashIp(req: Request): Promise<string> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const data = new TextEncoder().encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { action } = body;

    if (action === 'complete') {
      const { attempt_id, meeting_id } = body;
      if (!attempt_id) return Response.json({ error: 'attempt_id is required' }, { status: 400, headers: corsHeaders });

      const { data: meeting } = meeting_id
        ? await db.from('board_meetings').select('company_id').eq('id', meeting_id).single()
        : { data: null };

      const { data: usage } = await db.from('ai_usage_logs').select('estimated_cost').eq('user_id', user.id);
      const totalCost = (usage || []).reduce((sum, r) => sum + (Number(r.estimated_cost) || 0), 0);

      await db.from('free_meeting_attempts').update({
        completed: true,
        actual_cost: totalCost,
        meeting_id: meeting_id || null,
        company_id: meeting?.company_id || null,
      }).eq('id', attempt_id);

      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // action === 'check' (default)
    const allowed = await checkRateLimit(db, req, 'freeMeetingGate', { maxRequests: 10, windowMinutes: 60 });
    if (!allowed) {
      return Response.json({ eligible: false, reason: 'rate_limited', message: 'Too many attempts. Try again later.' }, { headers: corsHeaders });
    }

    const ipHash = await hashIp(req);

    // Backstop against a returning anonymous session — RLS already blocks
    // a second meeting insert, but checking here means a blocked visitor
    // never burns a real LLM call getting there.
    const { data: existingMeeting } = await db.from('board_meetings').select('id').eq('created_by_id', user.id).limit(1).maybeSingle();
    if (existingMeeting) {
      await db.from('free_meeting_attempts').insert({ ip_hash: ipHash, completed: false, blocked_reason: 'already_used', meeting_id: existingMeeting.id });
      return Response.json({ eligible: false, reason: 'already_used', existing_meeting_id: existingMeeting.id, message: ALREADY_USED_MESSAGE }, { headers: corsHeaders });
    }

    const { data: limitsRows } = await db.from('system_limits').select('free_meeting_daily_cost_ceiling_usd').order('created_at', { ascending: false }).limit(1);
    const ceiling = limitsRows?.[0]?.free_meeting_daily_cost_ceiling_usd ?? 12.70;

    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todaysAttempts } = await db.from('free_meeting_attempts').select('actual_cost').gte('started_at', todayStart.toISOString());
    const spentToday = (todaysAttempts || []).reduce((sum, r) => sum + (Number(r.actual_cost) || 0), 0);

    if (spentToday >= ceiling) {
      await db.from('free_meeting_attempts').insert({ ip_hash: ipHash, completed: false, blocked_reason: 'ceiling_reached' });
      return Response.json({ eligible: false, reason: 'ceiling_reached', message: CLOSED_MESSAGE }, { headers: corsHeaders });
    }

    const { data: attempt, error: insertErr } = await db.from('free_meeting_attempts').insert({ ip_hash: ipHash, completed: false }).select('id').single();
    if (insertErr || !attempt) return Response.json({ eligible: false, reason: 'error', message: 'Something went wrong. Please try again.' }, { headers: corsHeaders });

    return Response.json({ eligible: true, attempt_id: attempt.id }, { headers: corsHeaders });
  } catch (error) {
    console.error('freeMeetingGate error:', error);
    return Response.json({ eligible: false, reason: 'error', message: 'Something went wrong. Please try again.' }, { status: 500, headers: corsHeaders });
  }
});
