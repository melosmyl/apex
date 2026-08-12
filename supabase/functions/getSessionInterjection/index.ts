// getSessionInterjection — Phase E. Checked once per company page landed
// on (see AssistantContext), ahead of anything resurfacing-related.
// Priority when multiple qualify: welcome-back > accountability chase >
// note resurfacing (least frequent, most valuable first) — resurfacing is
// checked separately, later, off the founder's own typing (checkNoteRelevance).
//
// Gap-recovery detection (computeStreak) stays entirely client-side and
// unchanged (src/lib/momentum.js) — the client tells this function whether
// the founder is "away" and their streak numbers; this function only owns
// the budget check, the deterministic welcome-back template, and picking a
// prepared accountability chase. No LLM call for welcome-back at all — it's
// pure data framing, the cheapest and lowest-risk tier of everything here.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { interjectionBudgetSpent } from '../_shared/assistantCalls.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reworded first-person from MomentumWidget's existing copy — same rule,
// carried forward exactly: never a reset, never a penalty framing.
function welcomeBackText(streakCurrent, streakBest) {
  const bestClause = streakBest > streakCurrent ? ` — your best is ${streakBest}` : '';
  return `Welcome back. Your last streak was ${streakCurrent} ${streakCurrent === 1 ? 'day' : 'days'}${bestClause}. Pick up whenever you're ready.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { company_id, is_away, streak_current, streak_best } = await req.json();
    if (!company_id) return Response.json({ type: null }, { headers: corsHeaders });

    if (await interjectionBudgetSpent(db, user.id))
      return Response.json({ type: null, reason: 'budget_spent' }, { headers: corsHeaders });

    if (is_away) {
      await db.from('assistant_events').insert({ user_id: user.id, company_id, event_type: 'welcome_back_shown' });
      return Response.json({ type: 'welcome_back', text: welcomeBackText(streak_current || 0, streak_best || 0) }, { headers: corsHeaders });
    }

    const { data: chases } = await db.from('assistant_chases')
      .select('id, task_id, chase_text').eq('company_id', company_id).is('shown_at', null)
      .order('generated_at', { ascending: true }).limit(1);

    if (chases?.length) {
      const chase = chases[0];
      await db.from('assistant_chases').update({ shown_at: new Date().toISOString() }).eq('id', chase.id);
      await db.from('assistant_events').insert({ user_id: user.id, company_id, event_type: 'accountability_chase_shown', task_id: chase.task_id });
      return Response.json({ type: 'chase', text: chase.chase_text }, { headers: corsHeaders });
    }

    return Response.json({ type: null }, { headers: corsHeaders });
  } catch (error) {
    console.error('getSessionInterjection error:', error);
    return Response.json({ type: null }, { headers: corsHeaders });
  }
});
