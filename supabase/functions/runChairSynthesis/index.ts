import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHAIR_INSTRUCTIONS = `You are The Chair — the board meeting facilitator and synthesiser.

You are evaluating a multi-round executive board discussion. Before producing the Board Resolution, you must carefully evaluate the entire discussion:

1. Which arguments were strongest and why
2. Which arguments were disproven or weakened during the discussion
3. Which assumptions remain uncertain
4. Which advisor contributed the most persuasive reasoning
5. Whether genuine consensus exists or a minority opinion should be preserved
6. What evidence was missing that would have strengthened the discussion

Only after evaluating the discussion should you create the final recommendation.
Do not simply average opinions. Weigh the quality of arguments. Give more weight to arguments that survived scrutiny and less to those that were successfully challenged.

Do not introduce unsupported opinions. Accurately synthesise the advisors' arguments, identify areas of agreement and disagreement, weigh evidence, preserve minority opinions and create a clear recommendation. The founder always retains final authority.

SPECIFICITY — this is a hard requirement:
- Every recommendation must name something the founder could actually do this week. Who to call. What to write. Which number to look up. Which customer to ask.
- "Validate demand", "consider your positioning", "think about pricing" are not recommendations. They are categories of recommendation. Name the specific action inside the category.
- If you genuinely cannot name a concrete next action, say so and explain what information would make one possible. That is a useful contribution. A vague recommendation is not.
- Prefer the smallest real action over the most impressive-sounding one. "Call the six people who enquired last month and ask what stopped them" beats "conduct customer discovery research."`;

function formatTranscriptForChair(transcript) {
  const byRound = {};
  transcript.forEach(msg => {
    if (!byRound[msg.round]) byRound[msg.round] = [];
    byRound[msg.round].push(msg);
  });
  let text = '';
  for (const round of Object.keys(byRound).sort((a, b) => Number(a) - Number(b))) {
    const roundNum = Number(round);
    const msgs = byRound[round];
    text += `--- Round ${roundNum}${roundNum === 1 ? ' (Independent Positions)' : ' (Discussion)'} ---\n`;
    msgs.forEach(msg => {
      text += `${msg.advisor_name} (${msg.role})`;
      if (msg.reply_to_advisor) text += ` -> responding to ${msg.reply_to_advisor}`;
      if (msg.changed_opinion) text += ` [OPINION CHANGED]`;
      text += `: ${msg.message}\n`;
      if (msg.changed_opinion && msg.new_position) text += `  -> New position: ${msg.new_position}\n`;
      if (msg.new_risks?.length) text += `  -> New risks: ${msg.new_risks.join('; ')}\n`;
      text += `  [Confidence: ${msg.confidence_score}%]\n`;
    });
    text += '\n';
  }
  return text;
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);

    const { meeting_id } = await req.json();
    if (!meeting_id) return Response.json({ error: 'meeting_id is required' }, { status: 400, headers: corsHeaders });

    const { data: meeting } = await db.from('board_meetings').select('*').eq('id', meeting_id).single();
    if (!meeting) return Response.json({ error: 'Meeting not found' }, { status: 404, headers: corsHeaders });

    const independentResponses = meeting.independent_responses || [];
    const challengeResponses = meeting.challenge_responses || [];
    const discussionTranscript = meeting.discussion_transcript || [];

    const { data: advisors } = await db.from('advisors').select('*').eq('company_id', meeting.company_id).limit(100);
    let chairAdvisor = (advisors || []).find(a => a.library_key === 'chair' || (a.role || '').toLowerCase().includes('chair'));
    if (!chairAdvisor) chairAdvisor = (advisors || []).find(a => a.type !== 'human');
    if (!chairAdvisor) return Response.json({ error: 'No advisor available for chair synthesis' }, { status: 400, headers: corsHeaders });

    const resolutionSchema = {
      type: 'object',
      properties: {
        executive_summary: { type: 'string' },
        decision_question: { type: 'string' },
        recommended_direction: { type: 'string' },
        reasoning: { type: 'string' },
        areas_of_agreement: { type: 'array', items: { type: 'string' } },
        areas_of_disagreement: { type: 'array', items: { type: 'string' } },
        main_risks: { type: 'array', items: { type: 'string' } },
        minority_opinion: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
        missing_information: { type: 'array', items: { type: 'string' } },
        recommended_experiment: { type: 'string' },
        next_actions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, assigned_to: { type: 'string' } } } },
        overall_confidence_score: { type: 'number', description: 'A whole number from 0 to 100, never a 0-1 fraction' },
        discussion_evaluation: {
          type: 'object',
          properties: {
            strongest_arguments: { type: 'array', items: { type: 'string' } },
            disproven_arguments: { type: 'array', items: { type: 'string' } },
            uncertain_assumptions: { type: 'array', items: { type: 'string' } },
            most_persuasive_advisor: { type: 'string' },
            consensus_assessment: { type: 'string' },
            opinions_changed: { type: 'array', items: { type: 'string' } },
            missing_evidence: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['executive_summary', 'recommended_direction', 'reasoning', 'overall_confidence_score'],
    };

    let meetingContext;
    if (discussionTranscript.length > 0) {
      meetingContext = `=== FULL BOARD DISCUSSION TRANSCRIPT ===\nQuestion: ${meeting.question}\n\n${formatTranscriptForChair(discussionTranscript)}`;
    } else {
      meetingContext = `Independent advisor responses:\n${independentResponses.map(r =>
        `- ${r.advisor_name} (${r.role}): Position: ${r.position}. Recommendation: ${r.recommendation}. Key arguments: ${(r.key_arguments || []).join('; ')}. Risks: ${(r.risks || []).join('; ')}. Confidence: ${r.confidence_score}%`
      ).join('\n\n')}\n\nChallenge round:\n${challengeResponses.map(r =>
        `- ${r.advisor_name} challenged ${r.challenged_advisor}: ${r.point_challenged}. Reason: ${r.reason}. Revised position: ${r.revised_position}. Confidence: ${r.confidence_score}%`
      ).join('\n')}`;
    }

    const chairResult = await callAdvisor(supabaseUrl, serviceKey, {
      advisor_id: chairAdvisor.id, company_id: meeting.company_id, meeting_id: meeting.id, user_id: user.id,
      system_instructions: CHAIR_INSTRUCTIONS, company_context: null, meeting_context: meetingContext,
      user_question: meeting.question, previous_responses: [],
      output_schema: resolutionSchema, temperature: 0.5, max_output_length: 4000,
      request_type: 'chair_synthesis',
    });

    const resolution = chairResult?.response;
    if (!resolution) {
      await db.from('board_meetings').update({ status: 'failed' }).eq('id', meeting.id);
      return Response.json({ error: 'Chair synthesis failed. The board could not reach a resolution.' }, { status: 503, headers: corsHeaders });
    }

    // The schema asks for 0-100, but the model occasionally returns a 0-1
    // fraction anyway — round(0.72) displays as "1%" if this isn't
    // normalized before it's stored.
    if (typeof resolution.overall_confidence_score === 'number' && resolution.overall_confidence_score > 0 && resolution.overall_confidence_score <= 1) {
      resolution.overall_confidence_score = Math.round(resolution.overall_confidence_score * 100);
    }

    const nextActions = resolution.next_actions || [];
    const discussionField = discussionTranscript.length > 0
      ? discussionTranscript.map(m => ({ advisor: m.advisor_name, role: m.role, message: m.message, stance: m.message_type }))
      : [
          ...independentResponses.map(r => ({ advisor: r.advisor_name, role: r.role, message: `${r.position} ${r.recommendation}`, stance: 'supports' })),
          ...challengeResponses.map(r => ({ advisor: r.advisor_name, role: 'Challenge', message: r.revised_position, stance: 'challenges' })),
        ];

    const { data: updated } = await db.from('board_meetings').update({
      status: 'complete', board_resolution: resolution,
      executive_summary: resolution.executive_summary,
      recommendation: resolution.recommended_direction,
      confidence_score: resolution.overall_confidence_score,
      risks: resolution.main_risks || [],
      minority_opinion: resolution.minority_opinion || '',
      next_steps: nextActions.map(a => a.title),
      assigned_tasks: nextActions,
      discussion: discussionField,
    }).eq('id', meeting.id).select().single();

    return Response.json({
      meeting_id: meeting.id, status: 'complete',
      independent_responses: independentResponses, challenge_responses: challengeResponses,
      discussion_transcript: discussionTranscript,
      board_resolution: resolution, meeting: updated,
      memory_context: meeting.memory_context || null,
      chair_opening: meeting.chair_opening || null,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('runChairSynthesis error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
