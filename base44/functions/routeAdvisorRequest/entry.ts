import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// ─── Provider Adapters ──────────────────────────────────────────
// Each adapter implements the same interface:
//   (model, systemPrompt, userPrompt, temperature, maxTokens, timeoutMs) → { content, inputTokens, outputTokens }
// To add a new provider (e.g. Google Gemini), add a function here and register it in PROVIDERS.

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

async function callAnthropic(model, systemPrompt, userPrompt, temperature, maxTokens, timeoutMs) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, system: systemPrompt, temperature, max_tokens: maxTokens,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Anthropic error: ${data.error?.message || res.status}`);
    return { content: data.content[0].text, inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 };
  } finally { clearTimeout(timeout); }
}

async function callMistral(model, systemPrompt, userPrompt, temperature, maxTokens, timeoutMs) {
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
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
    if (!res.ok) throw new Error(`Mistral error: ${data.error?.message || res.status}`);
    return { content: data.choices[0].message.content, inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 };
  } finally { clearTimeout(timeout); }
}

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic, mistral: callMistral };

// ─── Response Validation & Repair ───────────────────────────────

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

// ─── Cost Estimation ────────────────────────────────────────────

function estimateCost(provider, inputTokens, outputTokens) {
  const rates = {
    openai: { input: 0.000005, output: 0.000015 },
    anthropic: { input: 0.000003, output: 0.000015 },
    mistral: { input: 0.000002, output: 0.000006 },
  };
  const r = rates[provider] || rates.openai;
  return Math.round((inputTokens * r.input + outputTokens * r.output) * 10000) / 10000;
}

// ─── Prompt Builders ────────────────────────────────────────────

function buildSystemPrompt(advisor, customInstructions, companyContext, meetingContext, outputSchema) {
  const instructions = customInstructions || advisor.system_instructions || advisor.biography || `You are ${advisor.name}, a ${advisor.role}.`;
  let prompt = `You are ${advisor.name}, ${advisor.role}.\n\n${instructions}\n\nDecision style: ${advisor.decision_style || 'Analytical'}.\nCommunication style: ${advisor.communication_style || 'Direct and professional'}.\nStrengths: ${(advisor.strengths || []).join(', ')}.\nBlind spots: ${(advisor.blind_spots || advisor.weaknesses || []).join(', ')}.\n\n`;
  if (companyContext) prompt += `Company Context:\n${companyContext}\n\n`;
  if (meetingContext) prompt += `Meeting Context:\n${meetingContext}\n\n`;
  prompt += `You must respond with ONLY valid JSON. Do not include any text outside the JSON object.`;
  if (outputSchema) prompt += `\n\nJSON structure:\n${JSON.stringify(outputSchema, null, 2)}`;
  return prompt;
}

function buildUserPrompt(question, previousResponses) {
  let prompt = `The founder asks the board: "${question}"\n\n`;
  if (previousResponses?.length) {
    prompt += `Other advisors have responded:\n`;
    previousResponses.forEach(r => {
      if (r.position) prompt += `- ${r.advisor}: ${r.position}${r.recommendation ? ` (Recommends: ${r.recommendation})` : ''}\n`;
      else if (r.revised_position) prompt += `- ${r.advisor} (challenge): ${r.revised_position}\n`;
    });
    prompt += '\n';
  }
  prompt += `Provide your response as a JSON object.`;
  return prompt;
}

// ─── Main Handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { advisor_id, company_id, meeting_id, system_instructions, company_context, meeting_context,
      user_question, previous_responses, output_schema, temperature, max_output_length, request_type } = await req.json();

    if (!advisor_id || !user_question)
      return Response.json({ error: 'advisor_id and user_question are required' }, { status: 400 });

    const advisor = await base44.asServiceRole.entities.Advisor.get(advisor_id);
    if (!advisor) return Response.json({ error: 'Advisor not found' }, { status: 404 });

    // Load system limits
    const limitsList = await base44.asServiceRole.entities.SystemLimits.list('-created_date', 1);
    const limits = limitsList[0] || { retry_count: 1, request_timeout_ms: 60000, max_output_length: 2000 };
    const timeoutMs = limits.request_timeout_ms || 60000;
    const retryCount = limits.retry_count ?? 1;
    const temp = temperature ?? advisor.temperature ?? 0.7;
    const maxLen = max_output_length ?? advisor.maximum_output_length ?? limits.max_output_length ?? 2000;

    let provider = advisor.default_provider || 'openai';
    let model = advisor.default_model || 'gpt-4o';
    const fbProvider = advisor.fallback_provider;
    const fbModel = advisor.fallback_model;

    // Check if model is active in AIModelConfigurations
    try {
      const configs = await base44.asServiceRole.entities.AIModelConfigurations.filter({ provider, model_name: model }, '-created_date', 1);
      if (configs.length && configs[0].is_active === false) {
        provider = fbProvider || provider;
        model = fbModel || model;
      }
    } catch { /* table may be empty — proceed with defaults */ }

    const systemPrompt = buildSystemPrompt(advisor, system_instructions, company_context, meeting_context, output_schema);
    const userPrompt = buildUserPrompt(user_question, previous_responses);
    const requiredFields = output_schema?.required || [];

    let result = null;
    let lastError = null;

    // Try primary provider (with retry)
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

    // Fallback to secondary provider
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

    // Log usage
    const logStatus = result ? (result.used_fallback ? 'fallback_used' : 'success') : 'error';
    try {
      await base44.asServiceRole.entities.AIUsageLog.create({
        user_id: user.id, company_id: company_id || null, meeting_id: meeting_id || null, advisor_id,
        provider: result ? result.provider_used : provider, model: result ? result.model_used : model,
        request_type: request_type || 'unknown',
        input_size: result ? result.input_tokens : 0, output_size: result ? result.output_tokens : 0,
        estimated_cost: estimateCost(result ? result.provider_used : provider, result ? result.input_tokens : 0, result ? result.output_tokens : 0),
        latency_ms: result ? result.latency_ms : 0, status: logStatus, error_code: !result ? lastError : null,
      });
    } catch (logErr) { console.error('Usage log failed:', logErr.message); }

    if (!result)
      return Response.json({ error: 'This advisor was temporarily unavailable. The board has continued using its backup intelligence provider.' }, { status: 503 });

    return Response.json(result);
  } catch (error) {
    console.error('routeAdvisorRequest error:', error);
    return Response.json({ error: 'This advisor was temporarily unavailable.' }, { status: 500 });
  }
});