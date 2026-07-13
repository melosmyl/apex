import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const { advisor_id, question, company_id } = await req.json();
    if (!advisor_id || !question)
      return Response.json({ error: 'advisor_id and question are required' }, { status: 400 });

    const advisor = await base44.asServiceRole.entities.Advisor.get(advisor_id);

    let companyContext = '';
    if (company_id) {
      try {
        const company = await base44.asServiceRole.entities.Company.get(company_id);
        companyContext = `Company: ${company.name}\nIndustry: ${company.industry || 'N/A'}\nDescription: ${company.description || ''}`;
      } catch { /* ignore */ }
    }

    const testSchema = {
      type: 'object',
      properties: {
        position: { type: 'string' },
        recommendation: { type: 'string' },
        key_arguments: { type: 'array', items: { type: 'string' } },
        confidence_score: { type: 'number' },
      },
      required: ['position', 'recommendation', 'confidence_score'],
    };

    const result = await base44.functions.invoke('routeAdvisorRequest', {
      advisor_id, company_id,
      system_instructions: advisor.system_instructions,
      company_context: companyContext, user_question: question,
      previous_responses: [], output_schema: testSchema,
      temperature: advisor.temperature, max_output_length: advisor.maximum_output_length,
      request_type: 'admin_test',
    });

    return Response.json({
      advisor_name: advisor.name,
      provider_used: result.data?.provider_used,
      model_used: result.data?.model_used,
      used_fallback: result.data?.used_fallback,
      latency_ms: result.data?.latency_ms,
      response: result.data?.response,
      error: result.data?.error,
    });
  } catch (error) {
    console.error('testAdvisor error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});