import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const CHAIR_SYNTHESIS_INSTRUCTIONS = `You are The Chair concluding the board meeting.

You have the FULL conversation transcript. Use it to produce a comprehensive resolution.

Your resolution must include:
- executive_summary: A clear summary of the discussion and the outcome reached
- recommended_direction: The strongest recommendation emerging from the debate
- reasoning: Why this direction, grounded in specific points from the discussion
- areas_of_agreement: Specific points where advisors converged (reference who agreed)
- areas_of_disagreement: Specific points where advisors diverged (reference who disagreed)
- main_risks: Key risks identified during the discussion
- minority_opinion: Any dissenting view that deserves acknowledgment
- assumptions: Key assumptions that underpin the recommendation
- missing_information: Information gaps that would improve confidence
- recommended_experiment: A test that could reduce uncertainty
- next_actions: Specific action items with assigned owners (use advisor names)
- overall_confidence_score: 0-100

Base EVERYTHING on the transcript. Do not invent points that were not discussed. Reference specific advisors and their arguments where relevant.`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { meeting_id } = await req.json();
    if (!meeting_id) return Response.json({ error: 'meeting_id is required' }, { status: 400 });

    const meeting = await base44.entities.BoardMeeting.get(meeting_id);
    if (!meeting) return Response.json({ error: 'Meeting not found' }, { status: 404 });

    const transcript = meeting.transcript || [];
    const transcriptStr = formatTranscript(transcript);
    const contextSnapshot = meeting.context_snapshot || '';

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

    const chairResult = await base44.functions.invoke('routeAdvisorRequest', {
      advisor_id: chairAdvisor.id, company_id: meeting.company_id, meeting_id: meeting.id,
      system_instructions: CHAIR_SYNTHESIS_INSTRUCTIONS,
      company_context: contextSnapshot,
      meeting_context: transcriptStr,
      user_question: meeting.question,
      output_schema: resolutionSchema,
      temperature: 0.5, max_output_length: 3000,
      request_type: 'chair_synthesis',
    });

    const resolution = chairResult.data?.response;
    if (!resolution) {
      await base44.entities.BoardMeeting.update(meeting.id, { status: 'failed' });
      return Response.json({ error: 'Chair synthesis failed. The board could not reach a resolution.' }, { status: 503 });
    }

    const nextActions = resolution.next_actions || [];

    // Build backward-compatible independent_responses and challenge_responses from transcript
    const independentResponses = transcript
      .filter(t => t.phase === 'initial_positions' && t.speaker_type === 'advisor')
      .map(t => ({
        advisor_id: t.advisor_id, advisor_name: t.speaker_name, role: t.advisor_role,
        position: t.message, recommendation: '', key_arguments: [], assumptions: [],
        risks: [], missing_information: [], suggested_actions: [], confidence_score: 0,
      }));

    const challengeResponses = transcript
      .filter(t => ['challenge', 'rebuttal', 'discussion'].includes(t.phase) && t.speaker_type === 'advisor')
      .map(t => ({
        advisor_id: t.advisor_id, advisor_name: t.speaker_name,
        challenged_advisor: t.responds_to || '', point_challenged: '', reason: '',
        revised_position: t.message, confidence_score: 0,
      }));

    const updated = await base44.entities.BoardMeeting.update(meeting.id, {
      status: 'complete', board_resolution: resolution,
      executive_summary: resolution.executive_summary,
      recommendation: resolution.recommended_direction,
      confidence_score: resolution.overall_confidence_score,
      risks: resolution.main_risks || [],
      minority_opinion: resolution.minority_opinion || '',
      next_steps: nextActions.map(a => a.title),
      assigned_tasks: nextActions,
      meeting_phase: 'resolution',
      independent_responses: independentResponses,
      challenge_responses: challengeResponses,
      discussion: transcript.map(t => ({
        advisor: t.speaker_name, role: t.advisor_role, message: t.message, stance: t.stance || '',
      })),
    });

    return Response.json({
      meeting_id: meeting.id, status: 'complete',
      transcript, board_resolution: resolution, meeting: updated,
    });
  } catch (error) {
    console.error('runChairSynthesis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function formatTranscript(transcript) {
  return transcript.map(t => {
    const speaker = t.speaker_type === 'chair' ? 'The Chair' :
                    t.speaker_type === 'founder' ? `Founder (${t.speaker_name})` :
                    `${t.speaker_name} (${t.advisor_role})`;
    const response = t.responds_to ? ` [responding to ${t.responds_to}]` : '';
    return `[${t.phase}] ${speaker}${response}: ${t.message}`;
  }).join('\n\n');
}