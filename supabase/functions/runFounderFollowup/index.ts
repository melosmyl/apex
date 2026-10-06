import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireOwnedRow, requireMaxLength, checkUserLimit, accessErrorResponse, TEXT_LIMITS, MAX_FOLLOWUPS_PER_MEETING } from '../_shared/access.ts';
import { CALL_DEADLINE_MS, CALLER_SAVE_MARGIN_MS } from '../_shared/callPolicy.ts';
import { FOLLOWUP_SCHEMA } from '../_shared/answerSchemas.ts';
import { findChair, withoutChair } from '../_shared/chair.ts';

// At most five debaters answer (startBoardMeeting seats the same); the
// Chair doesn't debate, here or in any round.
const MAX_DEBATERS = 5;

// Ported from base44/functions/runFounderFollowup/entry.ts — that version
// was never deployed (Base44 SDK, dead since the migration off Base44).
// Logic kept as-is: append the founder's message to the transcript as one
// more round, then call routeAdvisorRequest for every AI advisor on the
// meeting in parallel, same as every other discussion round. This is not a
// second debate engine — it's the same one, one more round.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildFollowupContext(founderMessage, transcript, originalQuestion) {
  let context = `=== FOUNDER FOLLOW-UP ===\n\n`;
  context += `Original board question: ${String(originalQuestion || '').slice(0, 4000)}\n\n`;
  context += `The founder has reviewed the board's discussion and resolution, and writes:\n`;
  context += `"${founderMessage}"\n\n`;
  context += `Your task: Respond directly to the founder's message. Address their concerns, answer their questions, provide additional insights, and if appropriate, revise your recommendation. Be honest and direct — if you disagree with the founder, say so respectfully. Do not simply agree to please them.\n\n`;
  context += `=== FULL DISCUSSION TRANSCRIPT ===\n`;
  transcript.forEach(msg => {
    const isFounder = msg.message_type === 'founder_message';
    const label = isFounder ? 'FOUNDER' : `${msg.advisor_name} (${msg.role})`;
    context += `${label}: ${msg.message}\n`;
    if (msg.changed_opinion && msg.new_position) context += `  -> New position: ${msg.new_position}\n`;
  });
  return context;
}

async function callAdvisor(supabaseUrl, serviceKey, payload) {
  const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `routeAdvisorRequest failed (${res.status})`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    // Anonymous free-meeting sessions never get this option in the UI, but
    // enforce it here too rather than trusting the client — same reasoning
    // as runChairSynthesis's task-creation guard.
    if (user.is_anonymous) return Response.json({ error: 'Follow-up questions require an account.' }, { status: 403, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { meeting_id, founder_message } = await req.json();
    if (!meeting_id || !founder_message?.trim())
      return Response.json({ error: 'meeting_id and founder_message are required' }, { status: 400, headers: corsHeaders });

    requireMaxLength(founder_message, TEXT_LIMITS.founder_message, 'Your message');
    const meeting = await requireOwnedRow(db, 'board_meetings', meeting_id, user.id);
    // Follow-ups are for a board meeting that reached its resolution.
    if (meeting.status !== 'complete' || (meeting.meeting_mode && meeting.meeting_mode !== 'board_debate'))
      return Response.json({ error: 'Follow-up questions are for finished board meetings.' }, { status: 409, headers: corsHeaders });
    await checkUserLimit(db, user.id, 'followup');
    const followupsSoFar = (meeting.discussion_transcript || []).filter(e => e.advisor_name === 'Founder').length;
    if (followupsSoFar >= MAX_FOLLOWUPS_PER_MEETING)
      return Response.json({ error: `This meeting has reached its ${MAX_FOLLOWUPS_PER_MEETING} follow-up questions. Start a new meeting to keep going.` }, { status: 429, headers: corsHeaders });

    const independentResponses = meeting.independent_responses || [];
    if (!independentResponses.length)
      return Response.json({ error: 'No independent responses found' }, { status: 400, headers: corsHeaders });

    const { data: advisors } = await db.from('advisors').select('*').eq('company_id', meeting.company_id).eq('created_by_id', user.id).limit(100);
    // Only the advisors the server chose when the meeting started, not the
    // browser-editable independent_responses.
    // Meetings from before participant_advisor_ids existed match by name: at
    // most one advisor per name, and never more than a meeting seats.
    const chosen = meeting.participant_advisor_ids?.length ? new Set(meeting.participant_advisor_ids) : null;
    const chosenNames = new Set(meeting.participants || []);
    const seenNames = new Set();
    const meetingAdvisors = withoutChair((advisors || []).filter(a => {
      if (a.type === 'human') return false;
      if (chosen) return chosen.has(a.id);
      if (!chosenNames.has(a.name) || seenNames.has(a.name)) return false;
      seenNames.add(a.name);
      return true;
    }), findChair(advisors)).slice(0, MAX_DEBATERS);
    if (!meetingAdvisors.length)
      return Response.json({ error: 'No AI advisors available for follow-up' }, { status: 400, headers: corsHeaders });

    const transcript = meeting.discussion_transcript || [];
    const maxRound = transcript.length ? Math.max(...transcript.map(m => m.round || 0)) : 0;
    const nextRound = maxRound + 1;

    const founderEntry = {
      round: nextRound,
      advisor_id: null,
      advisor_name: 'Founder',
      role: 'Founder',
      message: founder_message.trim(),
      message_type: 'founder_message',
      reply_to_advisor: null,
      changed_opinion: false,
      new_position: null,
      new_risks: [],
      confidence_score: null,
      provider_used: null,
      model_used: null,
    };

    let updatedTranscript = [...transcript, founderEntry];

    // Save the founder's message immediately, before the advisor calls —
    // matches the ported original: the question is real and recorded even
    // if an advisor call fails partway through.
    await db.from('board_meetings').update({ discussion_transcript: updatedTranscript }).eq('id', meeting.id);

    const followupContext = buildFollowupContext(founder_message.trim(), updatedTranscript, meeting.question);

    // Model calls end in time for this function to save their answers.
    const deadlineAt = startedAt + CALL_DEADLINE_MS - CALLER_SAVE_MARGIN_MS;

    const roundResults = await Promise.all(meetingAdvisors.map(advisor =>
      callAdvisor(supabaseUrl, serviceKey, {
        advisor_id: advisor.id, company_id: meeting.company_id, meeting_id: meeting.id, user_id: user.id, anonymous: !!user.is_anonymous,
        system_instructions: null, company_context: null, meeting_context: followupContext,
        user_question: meeting.question, previous_responses: [], output_schema: FOLLOWUP_SCHEMA,
        temperature: advisor.temperature, request_type: 'founder_followup', deadline_at: deadlineAt,
      }).then(data => ({ advisor, data })).catch(err => ({ advisor, error: err.message }))
    ));

    const advisorMessages = roundResults.map(r => {
      if (r.error || !r.data?.response) return null;
      const resp = r.data.response;
      return {
        round: nextRound, advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
        message: resp.message || '', message_type: resp.message_type || 'rebuttal',
        reply_to_advisor: 'Founder', changed_opinion: resp.changed_opinion || false,
        new_position: resp.new_position || null, new_risks: resp.new_risks || [],
        confidence_score: resp.confidence_score || 0,
        provider_used: r.data.provider_used, model_used: r.data.model_used,
      };
    }).filter(Boolean);

    updatedTranscript = [...updatedTranscript, ...advisorMessages];

    await db.from('board_meetings').update({ discussion_transcript: updatedTranscript }).eq('id', meeting.id);

    return Response.json({
      meeting_id: meeting.id,
      discussion_transcript: updatedTranscript,
    }, { headers: corsHeaders });
  } catch (error) {
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    console.error('runFounderFollowup error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
