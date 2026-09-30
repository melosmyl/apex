// The model-calling core shared by routeAdvisorRequest (every product LLM
// call) and testAdvisor (the admin "Test advisor" button): provider adapters,
// response validation, the retry-then-fallback loop with a record of every
// attempt, cost, and the usage-log insert. It lives in one place because the
// two copies drifted — testAdvisor kept reading content[0].text after
// routeAdvisorRequest had been fixed.

export const ANTHROPIC_NO_TEMP_MODELS = new Set([
  'claude-sonnet-5', 'claude-sonnet-4-6',
  'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
  'claude-fable-5', 'claude-mythos-5',
]);

// Supabase cuts an edge function off if it hasn't responded within 150s.
// Staying under that means the usage row below is always written, even when
// every attempt times out — which is exactly the case it's there to explain.
export const CALL_DEADLINE_MS = 140_000;
const MIN_ATTEMPT_MS = 5_000;

// Read the body as text first: during a provider outage the gateway returns
// an HTML error page, and res.json() on that threw a SyntaxError that got
// logged like a code bug instead of an HTTP error from the provider.
async function readBody(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

function providerError(name, status, message) {
  const e = new Error(`${name} error: HTTP ${status}${message ? ` — ${message}` : ''}`);
  e.httpStatus = status;
  return e;
}

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
    const data = await readBody(res);
    if (!res.ok || !data) throw providerError('OpenAI', res.status, data?.error?.message || (!data ? 'response was not JSON' : null));
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? null,
      stopReason: choice?.finish_reason ?? null,
      contentBlocks: null,
      inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0,
    };
  } finally { clearTimeout(timeout); }
}

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
    const data = await readBody(res);
    if (!res.ok || !data) throw providerError('Anthropic', res.status, data?.error?.message || (!data ? 'response was not JSON' : null));
    // content is a list of typed blocks, and it doesn't start with the text:
    // models that think by default (claude-sonnet-5 does when `thinking` is
    // omitted) put a thinking block first, so content[0].text was undefined
    // and every such call failed as "Invalid response format".
    const blocks = data.content || [];
    return {
      content: blocks.find((b) => b.type === 'text')?.text ?? null,
      stopReason: data.stop_reason ?? null,
      contentBlocks: blocks.map((b) => b.type),
      inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0,
    };
  } finally { clearTimeout(timeout); }
}

const PROVIDERS = { openai: callOpenAI, anthropic: callAnthropic };

// reason: null when valid, else 'no_text_block' | 'invalid_json' | 'missing_fields'
// (with the missing field names) — recorded per attempt in ai_usage_logs.attempts.
export function validateAndParse(content, requiredFields) {
  if (!content) return { parsed: null, valid: false, reason: 'no_text_block' };
  let parsed = null;
  try { parsed = JSON.parse(content); }
  catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch { return { parsed: null, valid: false, reason: 'invalid_json' }; } }
    else return { parsed: null, valid: false, reason: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object') return { parsed: null, valid: false, reason: 'invalid_json' };
  const missing = (requiredFields || []).filter((f) => parsed[f] === undefined || parsed[f] === null);
  if (missing.length) return { parsed, valid: false, reason: 'missing_fields', missing };
  return { parsed, valid: true, reason: null };
}

// Per-model rates where they differ meaningfully from the provider default —
// the cheap tier is roughly 30x cheaper than gpt-4o, so pricing it at the
// provider-level rate would hide the entire point of routing to it.
const MODEL_RATES = {
  'openai:gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
};

export function estimateCost(provider, model, inputTokens, outputTokens) {
  const providerRates = {
    openai: { input: 0.000005, output: 0.000015 },
    anthropic: { input: 0.000003, output: 0.000015 },
  };
  const r = MODEL_RATES[`${provider}:${model}`] || providerRates[provider] || providerRates.openai;
  return Math.round((inputTokens * r.input + outputTokens * r.output) * 10000) / 10000;
}

// Totals across every attempt, not just the one that succeeded: a failed
// attempt that got as far as a response (cut off, no text, bad JSON) was
// still billed, and the free-meeting spend ceiling sums estimated_cost.
export function usageTotals(attempts) {
  let input = 0, output = 0, cost = 0;
  for (const a of attempts) {
    input += a.input_tokens || 0;
    output += a.output_tokens || 0;
    cost += estimateCost(a.provider, a.model, a.input_tokens || 0, a.output_tokens || 0);
  }
  return { input, output, cost: Math.round(cost * 10000) / 10000 };
}

// Whether asking the same model again could plausibly succeed. A timeout or
// a cut-off answer would just repeat (same prompt, same cap), and a 4xx
// other than a rate limit is the provider rejecting the request itself —
// retrying those only burns the time the fallback model needs to rescue
// the advisor. A fresh sample can fix unparseable or incomplete JSON.
function worthRetrying(entry) {
  if (entry.outcome === 'timeout' || entry.truncated) return false;
  if (entry.outcome === 'api_error') {
    const s = entry.http_status;
    return s === 408 || s === 409 || s === 429 || s >= 500;
  }
  if (entry.outcome === 'error') return !/not configured|Unknown provider/.test(entry.error || '');
  return true;
}

// Tries the primary model up to retryCount+1 times (only retrying when that
// could help), then the fallback model the same way, and records every
// attempt — the usage row used to keep only the last error of a call that
// failed outright, so a primary rescued by the fallback was invisible.
export async function callWithFallback({
  provider, model, fbProvider, fbModel, systemPrompt, userPrompt,
  temperature, maxTokens, timeoutMs, retryCount, requiredFields, deadlineAt,
}) {
  const attempts = [];
  let lastError = null;

  // Returns the result, or null plus whether the same model is worth another try.
  const tryModel = async (p, m, isFallback) => {
    const where = `${p}/${m}${isFallback ? ' (fallback)' : ''}`;
    const entry = { n: attempts.length + 1, provider: p, model: m, fallback: isFallback, max_tokens: maxTokens };
    attempts.push(entry);
    const remaining = deadlineAt - Date.now();
    if (remaining < MIN_ATTEMPT_MS) {
      entry.outcome = 'skipped_deadline';
      // The real failure stays the headline (error_code, the 503 reason, the
      // provider-health alert); running out of time is noted after it.
      lastError = lastError ? `${lastError}; ${where} not attempted, out of time` : `${where}: not attempted, out of time`;
      return { result: null, retry: false };
    }
    const startTime = Date.now();
    try {
      const adapter = PROVIDERS[p];
      if (!adapter) throw new Error(`Unknown provider: ${p}`);
      const raw = await adapter(m, systemPrompt, userPrompt, temperature, maxTokens, Math.min(timeoutMs, remaining));
      const truncated = raw.stopReason === 'max_tokens' || raw.stopReason === 'length';
      Object.assign(entry, {
        latency_ms: Date.now() - startTime, stop_reason: raw.stopReason, truncated,
        content_blocks: raw.contentBlocks, input_tokens: raw.inputTokens, output_tokens: raw.outputTokens,
      });
      const { parsed, valid, reason, missing } = validateAndParse(raw.content, requiredFields);
      if (valid) {
        entry.outcome = 'ok';
        return { result: { response: parsed, provider_used: p, model_used: m, used_fallback: isFallback, latency_ms: entry.latency_ms, input_tokens: raw.inputTokens, output_tokens: raw.outputTokens } };
      }
      entry.outcome = reason;
      if (missing) entry.missing_fields = missing;
      lastError = `${where}: ` + (truncated
        ? `response cut off at ${maxTokens} tokens (${raw.stopReason})`
        : reason === 'missing_fields' ? `missing required fields: ${missing.join(', ')}`
        : reason === 'no_text_block' ? `no text in response (blocks: ${(raw.contentBlocks || []).join(', ') || 'none'})`
        : 'invalid response format');
    } catch (e) {
      entry.latency_ms = Date.now() - startTime;
      const aborted = e.name === 'AbortError';
      entry.outcome = aborted ? 'timeout' : e.httpStatus ? 'api_error' : 'error';
      if (e.httpStatus) entry.http_status = e.httpStatus;
      entry.error = String(e.message || e).slice(0, 200);
      lastError = `${where}: ` + (aborted ? `timed out after ${entry.latency_ms}ms` : e.message);
    }
    console.error(`Attempt ${entry.n} ${lastError}`);
    return { result: null, retry: worthRetrying(entry) };
  };

  const runModel = async (p, m, isFallback) => {
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const { result, retry } = await tryModel(p, m, isFallback);
      if (result) return result;
      if (!retry) break;
    }
    return null;
  };

  let result = await runModel(provider, model, false);
  if (!result && fbProvider && fbModel) result = await runModel(fbProvider, fbModel, true);
  return { result, attempts, lastError };
}

// Inserts one ai_usage_logs row. If the attempts column isn't there (the
// function deployed before its migration, or PostgREST's schema cache hasn't
// caught up), retry without it: losing the attempt detail is acceptable,
// losing the row is not — cost tracking, the free-meeting spend ceiling and
// the provider-health alerts all read these rows.
export async function insertUsageLog(db, row) {
  try {
    let { error } = await db.from('ai_usage_logs').insert(row);
    if (error && 'attempts' in row && (error.code === 'PGRST204' || error.code === '42703' || /attempts/.test(error.message || ''))) {
      const { attempts: _dropped, ...withoutAttempts } = row;
      ({ error } = await db.from('ai_usage_logs').insert(withoutAttempts));
    }
    if (error) console.error('Usage log failed:', error.message);
  } catch (e) { console.error('Usage log failed:', e.message); }
}
