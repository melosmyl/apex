import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Provider Adapters ──────────────────────────────────────────
async function callOpenAI(model, systemPrompt, userPrompt, temperature, maxTokens, timeoutMs) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, temperature, max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`OpenAI error: ${data.error?.message || res.status}`);
    return { content: data.choices[0].message.content, inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 };
  } finally { clearTimeout(timeout); }
}

const ANTHROPIC_NO_TEMP_MODELS = new Set([
  'claude-sonnet-5', 'claude-sonnet-4-6',
  'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
  'claude-fable-5', 'claude-mythos-5',
]);

async function callAnthropic(model, systemPrompt, userPrompt, temperature, maxTokens, timeoutMs) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { model, system: systemPrompt, max_tokens: maxTokens, messages: [{ role: 'user', content: userPrompt }] };
    if (!ANTHROPIC_NO_TEMP_MODELS.has(model)) body.temperature = temperature;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Anthropic error: ${data.error?.message || res.status}`);
    return { content: data.content[0].text, inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 };
  } finally { clearTimeout(timeout); }
}

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic };

function validateAndParse(content, requiredFields) {
  if (!content) return { parsed: null, valid: false };
  let parsed = null;
  try { parsed = JSON.parse(content); }
  catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch { return { parsed: null, valid: false }; } }
    else return { parsed: null, valid: false };
  }
  if (requiredFields?.length) {
    for (const f of requiredFields) {
      if (parsed[f] === undefined || parsed[f] === null) return { parsed, valid: false };
    }
  }
  return { parsed, valid: true };
}

function estimateCost(provider, inputTokens, outputTokens) {
  const rates = {
    openai: { input: 0.000005, output: 0.000015 },
    anthropic: { input: 0.000003, output: 0.000015 },
  };
  const r = rates[provider] || rates.openai;
  return Math.round((inputTokens * r.input + outputTokens * r.output) * 10000) / 10000;
}

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

    let provider = advisor.default_provider || 'openai';
    let model = advisor.default_model || 'gpt-4o';
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

    let result = null;
    let lastError = null;

    for (let attempt = 0; attempt <= retryCount && !result; attempt++) {
      try {
        const adapter = PROVIDERS[provider];
        if (!adapter) throw new Error(`Unknown provider: ${provider}`);
        const startTime = Date.now();
        const raw = await adapter(model, systemPrompt, userPrompt, temp, maxLen, timeoutMs);
        const latency = Date.now() - startTime;
        const { parsed, valid } = validateAndParse(raw.content, requiredFields);
        if (valid) {
          result = { response: parsed, provider_used: provider, model_used: model, used_fallback: false, latency_ms: latency, input_tokens: raw.inputTokens, output_tokens: raw.outputTokens };
        } else { lastError = 'Invalid response format'; }
      } catch (e) {
        console.error(`Provider ${provider} attempt ${attempt}: ${e.message}`);
        lastError = e.message;
      }
    }

    if (!result && fbProvider && fbModel) {
      for (let attempt = 0; attempt <= retryCount && !result; attempt++) {
        try {
          const adapter = PROVIDERS[fbProvider];
          if (!adapter) throw new Error(`Unknown provider: ${fbProvider}`);
          const startTime = Date.now();
          const raw = await adapter(fbModel, systemPrompt, userPrompt, temp, maxLen, timeoutMs);
          const latency = Date.now() - startTime;
          const { parsed, valid } = validateAndParse(raw.content, requiredFields);
          if (valid) {
            result = { response: parsed, provider_used: fbProvider, model_used: fbModel, used_fallback: true, latency_ms: latency, input_tokens: raw.inputTokens, output_tokens: raw.outputTokens };
          } else { lastError = 'Invalid response format (fallback)'; }
        } catch (e) {
          console.error(`Fallback ${fbProvider} attempt ${attempt}: ${e.message}`);
          lastError = e.message;
        }
      }
    }

    const logStatus = result ? (result.used_fallback ? 'fallback_used' : 'success') : 'error';
    try {
      await db.from('ai_usage_logs').insert({
        user_id: user.id, company_id: company_id || null, advisor_id,
        provider: result ? result.provider_used : provider, model: result ? result.model_used : model,
        request_type: 'admin_test',
        input_size: result ? result.input_tokens : 0, output_size: result ? result.output_tokens : 0,
        estimated_cost: estimateCost(result ? result.provider_used : provider, result ? result.input_tokens : 0, result ? result.output_tokens : 0),
        latency_ms: result ? result.latency_ms : 0, status: logStatus, error_code: !result ? lastError : null,
      });
    } catch (logErr) { console.error('Usage log failed:', logErr.message); }

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
