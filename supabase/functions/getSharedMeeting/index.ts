// getSharedMeeting — Phase 4.2. Public, unauthenticated, read-only lookup of
// a single board meeting by its share_token. This is the view that matters
// most for Phase 4: publishable transcripts are the marketing asset, and
// the whole point is proving advisors genuinely disagree — so the full
// debate (independent positions, challenge round, minority opinion,
// discussion transcript) is returned in full, not flattened down to just
// the Chair's synthesis.
//
// INVARIANT: this endpoint is public and unauthenticated. It must never
// trigger an LLM call, never call routeAdvisorRequest, and never perform
// any billable operation — read-only lookup, nothing else. Keep it that
// way even as this file changes.
//
// A revoked token and one that never existed both simply fail to match any
// row — the same "not found" path, by construction. The response is
// identical and deliberately uninformative either way.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOT_AVAILABLE = { error: 'This link is no longer available.' };

function curateIndependent(r: any) {
  return {
    advisor_name: r.advisor_name,
    role: r.role,
    position: r.position,
    recommendation: r.recommendation,
    key_arguments: r.key_arguments || [],
    assumptions: r.assumptions || [],
    risks: r.risks || [],
    missing_information: (r.missing_information || []).map((m: any) => (typeof m === 'string' ? m : m.detail)),
    confidence_score: r.confidence_score || 0,
    unavailable: !!r.unavailable,
  };
}

function curateChallenge(r: any) {
  return {
    advisor_name: r.advisor_name,
    challenged_advisor: r.challenged_advisor,
    point_challenged: r.point_challenged,
    reason: r.reason,
    revised_position: r.revised_position,
    confidence_score: r.confidence_score || 0,
  };
}

function curateTranscriptEntry(m: any) {
  return {
    round: m.round,
    advisor_name: m.advisor_name,
    role: m.role,
    message: m.message,
    reply_to_advisor: m.reply_to_advisor || null,
    changed_opinion: !!m.changed_opinion,
    new_position: m.new_position || null,
    confidence_score: m.confidence_score,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const allowed = await checkRateLimit(db, req, 'getSharedMeeting', { maxRequests: 30, windowMinutes: 5 });
    if (!allowed) return Response.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: corsHeaders });

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });

    let meeting;
    try {
      const { data, error } = await db.from('board_meetings').select('*').eq('share_token', token).single();
      if (error || !data) return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });
      meeting = data;
    } catch {
      return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });
    }

    // Only a finished debate is shareable — a partial meeting has nothing
    // meaningful to prove and would just be confusing.
    if (meeting.status !== 'complete') return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });

    const { data: company } = await db.from('companies').select('name').eq('id', meeting.company_id).single();

    const resolution = meeting.board_resolution || {};

    return Response.json({
      question: meeting.question,
      company_name: company?.name || null,
      participants: meeting.participants || [],
      created_at: meeting.created_at,
      chair_opening: meeting.chair_opening || null,
      executive_summary: resolution.executive_summary || meeting.executive_summary || null,
      recommended_direction: resolution.recommended_direction || meeting.recommendation || null,
      reasoning: resolution.reasoning || null,
      areas_of_agreement: resolution.areas_of_agreement || [],
      areas_of_disagreement: resolution.areas_of_disagreement || [],
      main_risks: resolution.main_risks || meeting.risks || [],
      minority_opinion: resolution.minority_opinion || meeting.minority_opinion || null,
      assumptions: resolution.assumptions || [],
      missing_information: (resolution.missing_information || []).map((m: any) => (typeof m === 'string' ? m : m.detail)),
      overall_confidence_score: resolution.overall_confidence_score || meeting.confidence_score || null,
      independent_responses: (meeting.independent_responses || []).map(curateIndependent),
      challenge_responses: (meeting.challenge_responses || []).map(curateChallenge),
      discussion_transcript: (meeting.discussion_transcript || []).map(curateTranscriptEntry),
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('getSharedMeeting error:', error);
    return Response.json(NOT_AVAILABLE, { status: 404, headers: corsHeaders });
  }
});
