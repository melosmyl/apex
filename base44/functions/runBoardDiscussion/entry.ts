import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DISCUSSION_PRINCIPLES = `DISCUSSION PRINCIPLES:
- Prioritise truth over harmony. The board exists to find the best decision, not to make everyone feel good.
- If you believe another advisor is wrong, say so clearly and explain why.
- If you believe the founder's premise has a flaw, raise it respectfully.
- Challenge every assumption. Ask: "What evidence supports this?" "What would make you completely change your opinion?" "Have we considered the opportunity cost?" "What is the strongest argument against your position?"
- If someone challenges you, do NOT automatically change your opinion. Defend it, clarify it, strengthen it — or admit you were wrong. Changing your mind is intelligent, not weak.
- Do NOT be agreeable. If everyone agrees too quickly, the discussion was not deep enough. Healthy disagreement is encouraged.
- Do NOT generate filler. Every message must add value: introduce evidence, challenge reasoning, clarify assumptions, offer alternatives, identify blind spots, or resolve disagreements.`;

function formatTranscript(transcript, currentAdvisorId) {
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
      const isYou = msg.advisor_id === currentAdvisorId;
      const youMarker = isYou ? ' [YOU]' : '';
      const reply = msg.reply_to_advisor ? ` (replying to ${msg.reply_to_advisor})` : '';
      const changed = msg.changed_opinion ? ' [OPINION CHANGED]' : '';
      text += `${msg.advisor_name} (${msg.role})${youMarker}${reply}${changed}: ${msg.message}\n`;
      if (msg.changed_opinion && msg.new_position) text += `  -> New position: ${msg.new_position}\n`;
      if (msg.new_risks?.length) text += `  -> New risks: ${msg.new_risks.join('; ')}\n`;
    });
    text += '\n';
  }
  return text;
}

function buildDiscussionContext(advisor, transcript, round, maxRounds, isLastRound) {
  const ownInitial = transcript.find(m => m.advisor_id === advisor.id && m.round === 1);

  let context = `=== EXECUTIVE BOARD DISCUSSION ===\n`;
  context += `You are in Round ${round} of ${maxRounds} of a structured board discussion.\n\n`;
  context += DISCUSSION_PRINCIPLES + '\n\n';

  if (ownInitial) {
    context += `YOUR INITIAL POSITION (from Round 1):\n`;
    context += `${ownInitial.message}\n`;
    context += `Confidence: ${ownInitial.confidence_score}%\n\n`;
  }

  const priorTranscript = transcript.filter(m => m.round < round);
  if (priorTranscript.length) {
    context += `DISCUSSION SO FAR:\n`;
    context += formatTranscript(priorTranscript, advisor.id);
    context += `\n`;
  }

  if (isLastRound) {
    context += `THIS IS THE FINAL ROUND. Provide your final statement: summarise your position after the full discussion, note whether your opinion has changed and why, and state your confidence level. If you are now in agreement with another advisor, say so explicitly.\n`;
  } else {
    context += `YOUR TASK: Contribute to the discussion. You may:\n`;
    context += `- Question another advisor's reasoning or ask for evidence\n`;
    context += `- Challenge an assumption or identify a weakness\n`;
    context += `- Defend your position against criticism\n`;
    context += `- Change your opinion if persuaded (explain why)\n`;
    context += `- Support another advisor's argument\n`;
    context += `- Identify a risk nobody has mentioned\n`;
    context += `- Introduce new information or evidence\n\n`;
    context += `Be direct, specific, and substantive. If replying to a specific advisor, name them. Do not repeat what others have already said. Every message must add value.\n`;
  }

  return context;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { meeting_id } = await req.json();
    if (!meeting_id) return Response.json({ error: 'meeting_id is required' }, { status: 400 });

    const meeting = await base44.entities.BoardMeeting.get(meeting_id);
    if (!meeting) return Response.json({ error: 'Meeting not found' }, { status: 404 });

    const independentResponses = meeting.independent_responses || [];
    if (!independentResponses.length)
      return Response.json({ error: 'No independent responses found' }, { status: 400 });

    const advisors = await base44.entities.Advisor.filter({ company_id: meeting.company_id }, '-created_date', 100);
    const meetingAdvisors = advisors.filter(a =>
      independentResponses.some(r => r.advisor_id === a.id) && a.type !== 'human'
    );

    if (!meetingAdvisors.length)
      return Response.json({ error: 'No AI advisors available for discussion' }, { status: 400 });

    // Load max discussion rounds
    const limitsList = await base44.asServiceRole.entities.SystemLimits.list('-created_date', 1);
    const limits = limitsList[0] || {};
    const maxRounds = limits.max_discussion_rounds || 3;

    // Build initial transcript from independent responses (Round 1)
    let transcript = independentResponses.map((r, i) => ({
      round: 1,
      advisor_id: r.advisor_id,
      advisor_name: r.advisor_name,
      role: r.role,
      message: r.position || r.recommendation || '',
      message_type: 'initial',
      reply_to_advisor: null,
      changed_opinion: false,
      new_position: null,
      new_risks: r.risks || [],
      confidence_score: r.confidence_score || 0,
      provider_used: r.provider_used,
      model_used: r.model_used,
    }));

    const discussionSchema = {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Your contribution to the board discussion. Be specific, critical, and substantive. Speak naturally as you would in a real board room.' },
        message_type: {
          type: 'string',
          enum: ['question', 'challenge', 'defense', 'rebuttal', 'support', 'new_information', 'risk_identified', 'opinion_changed', 'final_statement'],
          description: 'The primary nature of your contribution'
        },
        reply_to_advisor: { type: 'string', description: 'Name of the advisor you are primarily responding to. Leave empty if addressing the board generally.' },
        changed_opinion: { type: 'boolean', description: 'Whether this discussion has changed your position from your initial independent response' },
        new_position: { type: 'string', description: 'If you changed your opinion, state your new position. Leave empty if unchanged.' },
        new_risks: { type: 'array', items: { type: 'string' }, description: 'Any new risks or blind spots you have identified that have not been mentioned yet' },
        confidence_score: { type: 'number', description: 'Your current confidence in your recommendation, 0-100' },
      },
      required: ['message', 'message_type', 'confidence_score'],
    };

    // Run discussion rounds (Round 2 to maxRounds)
    for (let round = 2; round <= maxRounds; round++) {
      const isLastRound = round === maxRounds;

      const roundResults = await Promise.all(meetingAdvisors.map(advisor => {
        const meetingContext = buildDiscussionContext(advisor, transcript, round, maxRounds, isLastRound);

        return base44.functions.invoke('routeAdvisorRequest', {
          advisor_id: advisor.id,
          company_id: meeting.company_id,
          meeting_id: meeting.id,
          system_instructions: null,
          company_context: null,
          meeting_context: meetingContext,
          user_question: meeting.question,
          previous_responses: [],
          output_schema: discussionSchema,
          temperature: advisor.temperature,
          max_output_length: advisor.maximum_output_length,
          request_type: `discussion_round_${round}`,
        }).then(res => ({ advisor, data: res.data }))
          .catch(err => ({ advisor, error: err.message }));
      }));

      const roundMessages = roundResults.map((r, i) => {
        if (r.error || !r.data?.response) return null;
        const resp = r.data.response;
        return {
          round,
          advisor_id: r.advisor.id,
          advisor_name: r.advisor.name,
          role: r.advisor.role,
          message: resp.message || '',
          message_type: resp.message_type || (isLastRound ? 'final_statement' : 'rebuttal'),
          reply_to_advisor: resp.reply_to_advisor || null,
          changed_opinion: resp.changed_opinion || false,
          new_position: resp.new_position || null,
          new_risks: resp.new_risks || [],
          confidence_score: resp.confidence_score || 0,
          provider_used: r.data.provider_used,
          model_used: r.data.model_used,
        };
      }).filter(Boolean);

      if (!roundMessages.length) break;

      transcript = [...transcript, ...roundMessages];

      // Save progress after each round
      await base44.entities.BoardMeeting.update(meeting.id, {
        discussion_transcript: transcript,
        discussion_rounds_completed: round,
      });

      // Check for diminishing returns — stop if no opinions changed and no new risks
      const changes = roundMessages.filter(m => m.changed_opinion || (m.new_risks && m.new_risks.length > 0));
      if (changes.length === 0 && !isLastRound) break;
    }

    await base44.entities.BoardMeeting.update(meeting.id, {
      status: 'discussion_complete',
      discussion_transcript: transcript,
    });

    return Response.json({
      meeting_id: meeting.id,
      status: 'discussion_complete',
      discussion_transcript: transcript,
    });
  } catch (error) {
    console.error('runBoardDiscussion error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});