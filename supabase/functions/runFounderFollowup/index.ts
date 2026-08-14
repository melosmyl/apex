import { createClient } from 'jsr:@supabase/supabase-js@2';

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
  context += `Original board question: ${originalQuestion}\n\n`;
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

    const { data: meeting } = await db.from('board_meetings').select('*').eq('id', meeting_id).single();
    if (!meeting) return Response.json({ error: 'Meeting not found' }, { status: 404, headers: corsHeaders });

    const independentResponses = meeting.independent_responses || [];
    if (!independentResponses.length)
      return Response.json({ error: 'No independent responses found' }, { status: 400, headers: corsHeaders });

    const { data: advisors } = await db.from('advisors').select('*').eq('company_id', meeting.company_id).limit(100);
    const meetingAdvisors = (advisors || []).filter(a =>
      independentResponses.some(r => r.advisor_id === a.id) && a.type !== 'human'
    );
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

    const discussionSchema = {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Your response to the founder. Address their message directly, provide additional insights, and if appropriate, revise your recommendation.' },
        message_type: {
          type: 'string',
          enum: ['question', 'challenge', 'defense', 'rebuttal', 'support', 'new_information', 'risk_identified', 'opinion_changed', 'final_statement'],
          description: 'The primary nature of your response',
        },
        reply_to_advisor: { type: 'string', description: 'Set to "Founder" since you are responding to the founder.' },
        changed_opinion: { type: 'boolean', description: 'Whether the founder\'s input has changed your position' },
        new_position: { type: 'string', description: 'If you changed your opinion, state your new position. Leave empty if unchanged.' },
        new_risks: { type: 'array', items: { type: 'string' }, description: 'Any new risks or blind spots identified from the founder\'s input' },
        confidence_score: { type: 'number', description: 'Your current confidence, 0-100' },
      },
      required: ['message', 'message_type', 'confidence_score'],
    };

    const roundResults = await Promise.all(meetingAdvisors.map(advisor =>
      callAdvisor(supabaseUrl, serviceKey, {
        advisor_id: advisor.id, company_id: meeting.company_id, meeting_id: meeting.id, user_id: user.id,
        system_instructions: null, company_context: null, meeting_context: followupContext,
        user_question: meeting.question, previous_responses: [], output_schema: discussionSchema,
        temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
        request_type: 'founder_followup',
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
    console.error('runFounderFollowup error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
