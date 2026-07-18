import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CHAIR_INSTRUCTIONS = `You are The Chair — the board meeting facilitator and synthesiser.

Do not introduce unsupported opinions. Accurately synthesise the advisors' arguments, identify areas of agreement and disagreement, weigh evidence, preserve minority opinions and create a clear recommendation. The founder always retains final authority.`;

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
    const challengeResponses = meeting.challenge_responses || [];

    const advisors = await base44.entities.Advisor.filter({ company_id: meeting.company_id }, '-created_date', 100);
    let chairAdvisor = advisors.find(a => a.library_key === 'chair' || (a.role || '').toLowerCase().includes('chair'));
    if (!chairAdvisor) chairAdvisor = advisors.find(a => a.type !== 'human');
    if (!chairAdvisor) return Response.json({ error: 'No advisor available for chair synthesis' }, { status: 400 });

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
        overall_confidence_score: { type: 'number' },
      },
      required: ['executive_summary', 'recommended_direction', 'reasoning', 'overall_confidence_score'],
    };

    const allResponses = [
      ...independentResponses.map(r => ({ advisor: r.advisor_name, position: r.position, recommendation: r.recommendation })),
      ...challengeResponses.map(r => ({ advisor: r.advisor_name, revised_position: r.revised_position })),
    ];

    const meetingContext = `Independent advisor responses:\n${independentResponses.map(r =>
      `- ${r.advisor_name} (${r.role}): Position: ${r.position}. Recommendation: ${r.recommendation}. Key arguments: ${(r.key_arguments || []).join('; ')}. Risks: ${(r.risks || []).join('; ')}. Confidence: ${r.confidence_score}%`
    ).join('\n\n')}\n\nChallenge round:\n${challengeResponses.map(r =>
      `- ${r.advisor_name} challenged ${r.challenged_advisor}: ${r.point_challenged}. Reason: ${r.reason}. Revised position: ${r.revised_position}. Confidence: ${r.confidence_score}%`
    ).join('\n')}`;

    const chairResult = await base44.functions.invoke('routeAdvisorRequest', {
      advisor_id: chairAdvisor.id, company_id: meeting.company_id, meeting_id: meeting.id,
      system_instructions: CHAIR_INSTRUCTIONS, company_context: null, meeting_context: meetingContext,
      user_question: meeting.question, previous_responses: allResponses,
      output_schema: resolutionSchema, temperature: 0.5, max_output_length: 3000,
      request_type: 'chair_synthesis',
    });

    const resolution = chairResult.data?.response;
    if (!resolution) {
      await base44.entities.BoardMeeting.update(meeting.id, { status: 'failed' });
      return Response.json({ error: 'Chair synthesis failed. The board could not reach a resolution.' }, { status: 503 });
    }

    const nextActions = resolution.next_actions || [];

    const updated = await base44.entities.BoardMeeting.update(meeting.id, {
      status: 'complete', board_resolution: resolution,
      executive_summary: resolution.executive_summary,
      recommendation: resolution.recommended_direction,
      confidence_score: resolution.overall_confidence_score,
      risks: resolution.main_risks || [],
      minority_opinion: resolution.minority_opinion || '',
      next_steps: nextActions.map(a => a.title),
      assigned_tasks: nextActions,
      discussion: [
        ...independentResponses.map(r => ({ advisor: r.advisor_name, role: r.role, message: `${r.position} ${r.recommendation}`, stance: 'supports' })),
        ...challengeResponses.map(r => ({ advisor: r.advisor_name, role: 'Challenge', message: r.revised_position, stance: 'challenges' })),
      ],
    });

    return Response.json({
      meeting_id: meeting.id, status: 'complete',
      independent_responses: independentResponses, challenge_responses: challengeResponses,
      board_resolution: resolution, meeting: updated,
    });
  } catch (error) {
    console.error('runChairSynthesis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});