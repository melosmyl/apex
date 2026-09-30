import { createClient } from 'jsr:@supabase/supabase-js@2';
import { callWithFallback, usageTotals, insertUsageLog, CALL_DEADLINE_MS } from '../_shared/llmCall.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildSystemPrompt(advisor, customInstructions, companyContext, outputSchema) {
  const instructions = customInstructions || advisor.system_instructions || advisor.biography || `You are ${advisor.name}, a ${advisor.role}.`;
  let prompt = `You are ${advisor.name}, ${advisor.role}.\n\n${instructions}\n\nDecision style: ${advisor.decision_style || 'Analytical'}.\nCommunication style: ${advisor.communication_style || 'Direct and professional'}.\nStrengths: ${(advisor.strengths || []).join(', ')}.\nBlind spots: ${(advisor.blind_spots || advisor.weaknesses || []).join(', ')}.\n\n`;
  if (companyContext) prompt += `Company Context:\n${companyContext}\n\n`;
  prompt += `You must respond with ONLY valid JSON. Do not include any text outside the JSON object.`;
  if (outputSchema) prompt += `\n\nJSON structure:\n${JSON.stringify(outputSchema, null, 2)}`;
  return prompt;
}

function buildUserPrompt(question) {
  return `The founder asks the board: "${question}"\n\nProvide your response as a JSON object.`;
}

// ─── Main Handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    // Client scoped to the caller's own session — used only to check who they are.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    // Service-role client — bypasses RLS, used for all the actual data access below.
    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders });

    const { advisor_id, question, company_id } = await req.json();
    if (!advisor_id || !question)
      return Response.json({ error: 'advisor_id and question are required' }, { status: 400, headers: corsHeaders });

    const { data: advisor, error: advErr } = await db.from('advisors').select('*').eq('id', advisor_id).single();
    if (advErr || !advisor) return Response.json({ error: 'Advisor not found' }, { status: 404, headers: corsHeaders });

    let companyContext = '';
    if (company_id) {
      const { data: company } = await db.from('companies').select('*').eq('id', company_id).single();
      if (company) companyContext = `Company: ${company.name}\nIndustry: ${company.industry || 'N/A'}\nDescription: ${company.description || ''}`;
    }

    const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
    const limits = limitsList?.[0] || { retry_count: 1, request_timeout_ms: 60000, max_output_length: 2000 };
    const timeoutMs = limits.request_timeout_ms || 60000;
    const retryCount = limits.retry_count ?? 1;
    const temp = advisor.temperature ?? 0.7;
    const maxLen = advisor.maximum_output_length ?? limits.max_output_length ?? 2000;

    const provider = advisor.default_provider || 'openai';
    const model = advisor.default_model || 'gpt-4o';
    const fbProvider = advisor.fallback_provider;
    const fbModel = advisor.fallback_model;

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

    const systemPrompt = buildSystemPrompt(advisor, null, companyContext, testSchema);
    const userPrompt = buildUserPrompt(question);
    const requiredFields = testSchema.required;

    const { result, attempts, lastError } = await callWithFallback({
      provider, model, fbProvider, fbModel, systemPrompt, userPrompt,
      temperature: temp, maxTokens: maxLen, timeoutMs, retryCount, requiredFields,
      deadlineAt: startedAt + CALL_DEADLINE_MS,
    });

    const totals = usageTotals(attempts);
    await insertUsageLog(db, {
      user_id: user.id, company_id: company_id || null, advisor_id,
      provider: result ? result.provider_used : provider, model: result ? result.model_used : model,
      request_type: 'admin_test',
      input_size: totals.input, output_size: totals.output, estimated_cost: totals.cost,
      latency_ms: result ? result.latency_ms : Date.now() - startedAt,
      status: result ? (result.used_fallback ? 'fallback_used' : 'success') : 'error',
      error_code: !result ? lastError : null,
      attempts,
    });

    if (!result)
      return Response.json({ error: 'This advisor was temporarily unavailable.', detail: lastError }, { status: 503, headers: corsHeaders });

    return Response.json({
      advisor_name: advisor.name,
      provider_used: result.provider_used,
      model_used: result.model_used,
      used_fallback: result.used_fallback,
      latency_ms: result.latency_ms,
      response: result.response,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('test-advisor error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
