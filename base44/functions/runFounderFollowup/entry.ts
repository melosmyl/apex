import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { meeting_id, founder_message } = await req.json();
    if (!meeting_id || !founder_message?.trim())
      return Response.json({ error: 'meeting_id and founder_message are required' }, { status: 400 });

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
      return Response.json({ error: 'No AI advisors available for follow-up' }, { status: 400 });

    const transcript = meeting.discussion_transcript || [];
    const maxRound = transcript.length ? Math.max(...transcript.map(m => m.round || 0)) : 0;
    const nextRound = maxRound + 1;
    const founderName = user.full_name || (user.email ? user.email.split('@')[0] : 'Founder');

    // Add founder message to transcript
    const founderEntry = {
      round: nextRound,
      advisor_id: null,
      advisor_name: founderName,
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

    // Save founder message immediately
    await base44.entities.BoardMeeting.update(meeting.id, {
      discussion_transcript: updatedTranscript,
    });

    // Build context for advisors
    const followupContext = buildFollowupContext(founder_message.trim(), updatedTranscript, meeting.question);

    const discussionSchema = {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Your response to the founder. Address their message directly, provide additional insights, and if appropriate, revise your recommendation.' },
        message_type: {
          type: 'string',
          enum: ['question', 'challenge', 'defense', 'rebuttal', 'support', 'new_information', 'risk_identified', 'opinion_changed', 'final_statement'],
          description: 'The primary nature of your response'
        },
        reply_to_advisor: { type: 'string', description: 'Set to "Founder" since you are responding to the founder.' },
        changed_opinion: { type: 'boolean', description: 'Whether the founder\'s input has changed your position' },
        new_position: { type: 'string', description: 'If you changed your opinion, state your new position. Leave empty if unchanged.' },
        new_risks: { type: 'array', items: { type: 'string' }, description: 'Any new risks or blind spots identified from the founder\'s input' },
        confidence_score: { type: 'number', description: 'Your current confidence, 0-100' },
      },
      required: ['message', 'message_type', 'confidence_score'],
    };

    // Get advisor responses in parallel
    const roundResults = await Promise.all(meetingAdvisors.map(advisor =>
      base44.functions.invoke('routeAdvisorRequest', {
        advisor_id: advisor.id,
        company_id: meeting.company_id,
        meeting_id: meeting.id,
        system_instructions: null,
        company_context: null,
        meeting_context: followupContext,
        user_question: meeting.question,
        previous_responses: [],
        output_schema: discussionSchema,
        temperature: advisor.temperature,
        max_output_length: advisor.maximum_output_length,
        request_type: 'founder_followup',
      }).then(res => ({ advisor, data: res.data }))
        .catch(err => ({ advisor, error: err.message }))
    ));

    const advisorMessages = roundResults.map(r => {
      if (r.error || !r.data?.response) return null;
      const resp = r.data.response;
      return {
        round: nextRound,
        advisor_id: r.advisor.id,
        advisor_name: r.advisor.name,
        role: r.advisor.role,
        message: resp.message || '',
        message_type: resp.message_type || 'rebuttal',
        reply_to_advisor: 'Founder',
        changed_opinion: resp.changed_opinion || false,
        new_position: resp.new_position || null,
        new_risks: resp.new_risks || [],
        confidence_score: resp.confidence_score || 0,
        provider_used: r.data.provider_used,
        model_used: r.data.model_used,
      };
    }).filter(Boolean);

    updatedTranscript = [...updatedTranscript, ...advisorMessages];

    await base44.entities.BoardMeeting.update(meeting.id, {
      discussion_transcript: updatedTranscript,
    });

    return Response.json({
      meeting_id: meeting.id,
      discussion_transcript: updatedTranscript,
    });
  } catch (error) {
    console.error('runFounderFollowup error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

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