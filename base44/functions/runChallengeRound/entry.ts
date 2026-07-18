import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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

    const challengeSchema = {
      type: 'object',
      properties: {
        challenged_advisor: { type: 'string', description: 'Name of the advisor whose argument you challenge' },
        point_challenged: { type: 'string' },
        reason: { type: 'string' },
        revised_position: { type: 'string', description: 'Your revised position after the challenge' },
        confidence_score: { type: 'number', description: '0-100' },
      },
      required: ['challenged_advisor', 'point_challenged', 'revised_position'],
    };

    const challengeResults = await Promise.all(independentResponses.map(resp => {
      const advisor = advisors.find(a => a.id === resp.advisor_id);
      if (!advisor) return Promise.resolve({ resp, error: 'Advisor not found' });

      const otherPositions = independentResponses
        .filter(r => r.advisor_id !== resp.advisor_id)
        .map(r => ({ advisor: r.advisor_name, position: r.position, recommendation: r.recommendation }));

      const meetingContext = `Independent positions from other advisors:\n${otherPositions.map(o => `- ${o.advisor}: ${o.position} (Recommends: ${o.recommendation})`).join('\n')}`;

      return base44.functions.invoke('routeAdvisorRequest', {
        advisor_id: advisor.id, company_id: meeting.company_id, meeting_id: meeting.id,
        system_instructions: advisor.system_instructions, company_context: null,
        meeting_context: meetingContext, user_question: meeting.question,
        previous_responses: otherPositions, output_schema: challengeSchema,
        temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
        request_type: 'challenge',
      }).then(res => ({ resp, data: res.data })).catch(err => ({ resp, error: err.message }));
    }));

    const challengeResponses = challengeResults.map(r => {
      const d = r.data;
      if (r.error || !d?.response) {
        return {
          advisor_id: r.resp.advisor_id, advisor_name: r.resp.advisor_name,
          challenged_advisor: '', point_challenged: '', reason: '',
          revised_position: 'This advisor was temporarily unavailable during the challenge round.',
          confidence_score: r.resp.confidence_score || 0,
        };
      }
      const resp = d.response;
      return {
        advisor_id: r.resp.advisor_id, advisor_name: r.resp.advisor_name,
        challenged_advisor: resp.challenged_advisor || '', point_challenged: resp.point_challenged || '',
        reason: resp.reason || '', revised_position: resp.revised_position || '',
        confidence_score: resp.confidence_score || r.resp.confidence_score || 0,
      };
    });

    await base44.entities.BoardMeeting.update(meeting.id, {
      status: 'challenge_complete', challenge_responses: challengeResponses,
    });

    return Response.json({
      meeting_id: meeting.id, status: 'challenge_complete', challenge_responses: challengeResponses,
    });
  } catch (error) {
    console.error('runChallengeRound error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});