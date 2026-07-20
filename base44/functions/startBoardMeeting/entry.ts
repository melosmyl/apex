import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { company_id, question, advisor_ids } = await req.json();
    if (!company_id || !question?.trim() || !advisor_ids?.length)
      return Response.json({ error: 'company_id, question and advisor_ids are required' }, { status: 400 });

    // Load limits
    const limitsList = await base44.asServiceRole.entities.SystemLimits.list('-created_date', 1);
    const limits = limitsList[0] || { max_advisors_per_meeting: 5, min_advisors_per_meeting: 3, max_context_size: 8000 };
    const minAdv = limits.min_advisors_per_meeting || 3;

    if (advisor_ids.length < minAdv)
      return Response.json({ error: `Select at least ${minAdv} advisors` }, { status: 400 });

    // Load company + context (all user-scoped)
    const company = await base44.entities.Company.get(company_id);
    const [documents, decisions, meetings, projects, advisors] = await Promise.all([
      base44.entities.Document.filter({ company_id }, '-created_date', 20),
      base44.entities.Decision.filter({ company_id }, '-created_date', 10),
      base44.entities.BoardMeeting.filter({ company_id }, '-created_date', 5),
      base44.entities.Project.filter({ company_id }, '-created_date', 10),
      base44.entities.Advisor.filter({ company_id }, '-created_date', 100),
    ]);

    const selectedAdvisors = advisors.filter(a => advisor_ids.includes(a.id) && a.type !== 'human');
    if (selectedAdvisors.length < minAdv)
      return Response.json({ error: 'Not enough AI advisors selected' }, { status: 400 });

    // Build context package
    const contextPackage = buildContext(company, documents, decisions, meetings, projects, limits.max_context_size || 8000);

    // Save meeting with status "preparing"
    const meeting = await base44.entities.BoardMeeting.create({
      company_id, question, participants: selectedAdvisors.map(a => a.name),
      status: 'preparing', independent_responses: [], challenge_responses: [],
    });

    // Phase 1: Independent responses (parallel)
    const independentSchema = {
      type: 'object',
      properties: {
        position: { type: 'string', description: 'Your overall position on the question' },
        recommendation: { type: 'string', description: 'Your specific recommendation' },
        key_arguments: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        missing_information: { type: 'array', items: { type: 'string' } },
        suggested_actions: { type: 'array', items: { type: 'string' } },
        confidence_score: { type: 'number', description: '0-100' },
      },
      required: ['position', 'recommendation', 'key_arguments', 'confidence_score'],
    };

    const independentResults = await Promise.all(selectedAdvisors.map(advisor =>
      base44.functions.invoke('routeAdvisorRequest', {
        advisor_id: advisor.id, company_id, meeting_id: meeting.id,
        system_instructions: advisor.system_instructions, company_context: contextPackage,
        user_question: question, previous_responses: [], output_schema: independentSchema,
        temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
        request_type: 'independent',
      }).then(res => ({ advisor, data: res.data })).catch(err => ({ advisor, error: err.message }))
    ));

    const independentResponses = independentResults.map(r => {
      const d = r.data;
      if (r.error || !d?.response) {
        return {
          advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
          provider_used: d?.provider_used || null, model_used: d?.model_used || null, used_fallback: d?.used_fallback || false,
          position: 'This advisor was temporarily unavailable.', recommendation: 'No recommendation available.',
          key_arguments: [], assumptions: [], risks: [], missing_information: [], suggested_actions: [], confidence_score: 0,
        };
      }
      const resp = d.response;
      return {
        advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
        provider_used: d.provider_used, model_used: d.model_used, used_fallback: d.used_fallback,
        position: resp.position || '', recommendation: resp.recommendation || '',
        key_arguments: resp.key_arguments || [], assumptions: resp.assumptions || [],
        risks: resp.risks || [], missing_information: resp.missing_information || [],
        suggested_actions: resp.suggested_actions || [], confidence_score: resp.confidence_score || 0,
      };
    });

    await base44.entities.BoardMeeting.update(meeting.id, {
      status: 'independent_complete', independent_responses: independentResponses,
    });

    return Response.json({
      meeting_id: meeting.id, status: 'independent_complete',
      independent_responses: independentResponses,
      advisor_names: selectedAdvisors.map(a => a.name),
    });
  } catch (error) {
    console.error('startBoardMeeting error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildContext(company, documents, decisions, meetings, projects, maxSize) {
  let ctx = `Company: ${company.name || 'N/A'}\nIndustry: ${company.industry || 'N/A'}\n`;
  ctx += `Description: ${company.description || company.tagline || 'N/A'}\n`;
  if (company.tagline) ctx += `Tagline: ${company.tagline}\n`;
  if (company.priorities?.length) ctx += `Strategic Priorities: ${company.priorities.join(', ')}\n`;
  if (company.metrics?.length) ctx += `Key Metrics: ${company.metrics.map(m => `${m.label}: ${m.value} (${m.trend})`).join(', ')}\n`;
  if (decisions?.length) {
    ctx += `\nRecent Decisions:\n`;
    decisions.slice(0, 5).forEach(d => { ctx += `- ${d.question}: ${d.final_recommendation || d.summary || 'N/A'}\n`; });
  }
  if (meetings?.length) {
    ctx += `\nPrevious Board Meetings:\n`;
    meetings.slice(0, 3).forEach(m => { ctx += `- Q: ${m.question} → ${m.recommendation || m.executive_summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive Projects:\n`;
    projects.slice(0, 5).forEach(p => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
  }
  if (documents?.length) {
    ctx += `\nRelevant Documents:\n`;
    documents.slice(0, 10).forEach(d => { ctx += `- ${d.title} (${d.category}): ${(d.content || '').slice(0, 400)}\n`; });
  }
  if (ctx.length > maxSize) ctx = ctx.slice(0, maxSize) + '... [truncated]';
  return ctx;
}