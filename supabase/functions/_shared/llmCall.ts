// The model-calling core shared by routeAdvisorRequest (every product LLM
// call) and testAdvisor (the admin "Test advisor" button): provider adapters,
// response validation, the retry-then-fallback loop with a record of every
// attempt, cost, and the usage-log insert. It lives in one place because the
// two copies drifted — testAdvisor kept reading content[0].text after
// routeAdvisorRequest had been fixed.
//
// What each kind of call may do (thinking, effort, output limit, answer
// format, time kept back for the fallback) comes from callPolicy.ts.

import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { CALL_DEADLINE_MS, claudeSettings, claudeStructuredOutputs, lowerEffort, maxOutputFor, ratesFor } from './callPolicy.ts';
import type { CallPolicy, Effort, ThinkingChoice } from './callPolicy.ts';
import { fitsAnthropicLimits, forAnthropic, forOpenAI, pastedSchemaText, validateAndParse } from './outputSchema.ts';

export { CALL_DEADLINE_MS };

const MIN_ATTEMPT_MS = 5_000;
// No bytes at all on the connection for this long, Anthropic's keep-alive
// pings included, means the reply is stuck rather than slow.
const SILENCE_LIMIT_MS = 60_000;
const PREVIEW_CHARS = 500;
// Longest wait before retrying a busy provider; a longer "retry after"
// moves on to the fallback instead.
const MAX_WAIT_MS = 20_000;
// For a reply stopped mid-way, output is estimated from how long it had been
// generating: thinking is billed but streams with no visible text. A high
// rate, so the free-meeting ceiling over-counts rather than under-counts.
const ESTIMATE_TOKENS_PER_S = 150;

type Fetch = typeof fetch;
type Format = 'native' | 'pasted';
// deno-lint-ignore no-explicit-any
type Schema = any;

type AttemptSpec = {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: Schema | null;
  format: Format;
  maxTokens: number;
  temperature: number;
  thinking: ThinkingChoice;
  effort: Effort;
  endBy: number;
  fetchImpl: Fetch;
  silenceLimitMs: number;
};

type Raw = {
  content: string | null;
  stopReason: string | null;
  contentBlocks: string[] | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number | null;
  refusal: { category: string | null; explanation: string | null } | null;
  ttfbMs: number | null;
  maxSilenceMs: number | null;
};

// A failed attempt, with whatever is known about why and what it used.
class CallFailure extends Error {
  httpStatus?: number;
  errorType?: string;
  retryAfterMs?: number;
  preview?: string;
  schemaRejected = false;
  aborted?: 'timeout' | 'stalled';
  connection = false;
  partial?: { inputTokens: number; outputTokens: number; estimated: boolean };
  maxSilenceMs?: number;
  constructor(message: string, fields: Partial<CallFailure> = {}) {
    super(message);
    Object.assign(this, fields);
  }
}

function retryAfterMs(headers: Headers | undefined | null): number | undefined {
  const ms = Number(headers?.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const v = headers?.get('retry-after');
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

// ---------------------------------------------------------------------
// OpenAI: one request, the answer shape enforced by strict json_schema.
// ---------------------------------------------------------------------
async function callOpenAI(a: AttemptSpec): Promise<Raw> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, a.endBy - Date.now()));
  const response_format = a.schema && a.format === 'native'
    ? { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: forOpenAI(a.schema) } }
    : { type: 'json_object' };
  try {
    // OPENAI_BASE_URL is for the local test stack's fake provider, like the
    // Anthropic SDK's own ANTHROPIC_BASE_URL; production leaves both unset.
    const base = Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const res = await a.fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: a.model, temperature: a.temperature, max_tokens: a.maxTokens,
        messages: [{ role: 'system', content: a.systemPrompt }, { role: 'user', content: a.userPrompt }],
        response_format,
      }),
      signal: controller.signal,
    });
    // Read as text first: during an outage the gateway returns an HTML page.
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok || !data) {
      const message = data?.error?.message || (!data ? 'response was not JSON' : null);
      throw new CallFailure(`OpenAI error: HTTP ${res.status}${message ? ` — ${message}` : ''}`, {
        httpStatus: res.status, errorType: data?.error?.type || data?.error?.code || undefined,
        retryAfterMs: retryAfterMs(res.headers), preview: text.slice(0, PREVIEW_CHARS),
        schemaRejected: res.status === 400 && a.format === 'native',
      });
    }
    const choice = data.choices?.[0];
    const message = choice?.message;
    return {
      content: message?.content ?? null,
      stopReason: choice?.finish_reason ?? null,
      contentBlocks: null,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      // gpt-4o reports reasoning_tokens: 0; only a model that thought has a figure.
      thinkingTokens: data.usage?.completion_tokens_details?.reasoning_tokens || null,
      refusal: message?.refusal ? { category: null, explanation: String(message.refusal).slice(0, PREVIEW_CHARS) } : null,
      ttfbMs: null,
      maxSilenceMs: null,
    };
  } catch (e) {
    if (e instanceof CallFailure) throw e;
    if ((e as Error).name === 'AbortError') throw new CallFailure('OpenAI: out of time', { aborted: 'timeout' });
    if (e instanceof TypeError) throw new CallFailure(`OpenAI connection failed: ${e.message}`, { connection: true });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// Anthropic: streamed through the official SDK, so a long think is told
// apart from a stuck connection, and time to first word is known.
// ---------------------------------------------------------------------

// Wraps fetch so every byte that arrives — keep-alive pings included, which
// the SDK swallows — resets the silence clock.
function watchedFetch(base: Fetch, watch: { lastByteAt: number; maxSilence: number; headersAt: number | null }): Fetch {
  return async (input, init) => {
    const res = await base(input, init);
    watch.lastByteAt = Date.now();
    watch.headersAt = watch.lastByteAt;
    if (!res.body) return res;
    const tap = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        const t = Date.now();
        watch.maxSilence = Math.max(watch.maxSilence, t - watch.lastByteAt);
        watch.lastByteAt = t;
        ctl.enqueue(chunk);
      },
    });
    return new Response(res.body.pipeThrough(tap), { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}

async function callAnthropic(a: AttemptSpec): Promise<Raw> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const started = Date.now();
  const watch = { lastByteAt: started, maxSilence: 0, headersAt: null as number | null };
  // Retries are ours (they know the deadline and the fallback), not the SDK's.
  const client = new Anthropic({ apiKey, authToken: null, maxRetries: 0, timeout: 10 * 60_000, fetch: watchedFetch(a.fetchImpl, watch) });
  const settings = claudeSettings(a.model, a.thinking, a.effort);
  const outputConfig: Anthropic.OutputConfig = {};
  if (settings.effort) outputConfig.effort = settings.effort;
  if (a.schema && a.format === 'native') outputConfig.format = { type: 'json_schema', schema: forAnthropic(a.schema) };
  // Temperature is never sent: thinking requires the default, and the
  // current models reject anything else.
  const stream = client.messages.stream({
    model: a.model, max_tokens: a.maxTokens, system: a.systemPrompt,
    messages: [{ role: 'user', content: a.userPrompt }],
    ...(settings.thinking ? { thinking: settings.thinking } : {}),
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
  });

  let firstWordAt: number | null = null;
  let textChars = 0;
  stream.on('streamEvent', (event) => {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      firstWordAt ??= Date.now();
      textChars += event.delta.text.length;
    }
  });
  let abortReason: 'timeout' | 'stalled' | null = null;
  const deadline = setTimeout(() => { abortReason = 'timeout'; stream.abort(); }, Math.max(0, a.endBy - started));
  const silence = setInterval(() => {
    if (Date.now() - watch.lastByteAt > a.silenceLimitMs) { abortReason = 'stalled'; stream.abort(); }
  }, 1_000);

  try {
    const msg = await stream.finalMessage();
    const blocks = msg.content || [];
    const text = blocks.find((b) => b.type === 'text');
    return {
      content: text && text.type === 'text' ? text.text : null,
      stopReason: msg.stop_reason ?? null,
      contentBlocks: blocks.map((b) => b.type),
      inputTokens: msg.usage?.input_tokens || 0,
      outputTokens: msg.usage?.output_tokens || 0,
      thinkingTokens: msg.usage?.output_tokens_details?.thinking_tokens ?? null,
      refusal: msg.stop_reason === 'refusal'
        ? { category: msg.stop_details?.category ?? null, explanation: msg.stop_details?.explanation ?? null }
        : null,
      ttfbMs: firstWordAt ? firstWordAt - started : null,
      maxSilenceMs: watch.maxSilence,
    };
  } catch (e) {
    // Anything generated before the failure was billed: count it, marked as
    // estimated. Visible text gives a floor; time spent generating covers
    // thinking, which streams with no text.
    const snap = stream.currentMessage;
    const generatingMs = snap && watch.headersAt ? Date.now() - watch.headersAt : 0;
    const partial = snap || textChars
      ? {
        inputTokens: snap?.usage?.input_tokens || 0,
        outputTokens: Math.min(a.maxTokens, Math.max(snap?.usage?.output_tokens || 0, Math.ceil(textChars / 4),
          Math.ceil((generatingMs / 1000) * ESTIMATE_TOKENS_PER_S))),
        estimated: true,
      }
      : undefined;
    const common = { partial, maxSilenceMs: watch.maxSilence };
    if (abortReason === 'timeout') throw new CallFailure('Anthropic: out of time', { ...common, aborted: 'timeout' });
    if (abortReason === 'stalled') throw new CallFailure(`Anthropic: no data for ${a.silenceLimitMs / 1000}s`, { ...common, aborted: 'stalled' });
    if (e instanceof Anthropic.APIConnectionError) {
      throw new CallFailure(`Anthropic connection failed: ${e.message}`, { ...common, connection: true });
    }
    if (e instanceof Anthropic.APIError) {
      // A mid-reply error (e.g. overloaded) arrives with no HTTP status, only a type.
      // The provider's own message; the SDK's own text repeats the status and raw body.
      const body = e.error as { error?: { message?: string } } | undefined;
      const message = body?.error?.message || e.message || '';
      throw new CallFailure(`Anthropic error: ${e.status ? `HTTP ${e.status}` : 'during the reply'} — ${message}`, {
        ...common, httpStatus: e.status, errorType: e.type ?? undefined,
        retryAfterMs: retryAfterMs(e.headers), preview: message.slice(0, PREVIEW_CHARS),
        schemaRejected: e.status === 400 && a.format === 'native',
      });
    }
    throw new CallFailure(`Anthropic: ${(e as Error).message || e}`, { ...common, connection: true });
  } finally {
    clearTimeout(deadline);
    clearInterval(silence);
  }
}

const PROVIDERS: Record<string, (a: AttemptSpec) => Promise<Raw>> = { openai: callOpenAI, anthropic: callAnthropic };

export { validateAndParse };

export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number) {
  const r = ratesFor(provider, model);
  return inputTokens * r.input + outputTokens * r.output;
}

// deno-lint-ignore no-explicit-any
export type AttemptEntry = Record<string, any>;

// Totals across every attempt, not just the one that succeeded: a failed
// attempt that got as far as a response (cut off, no text, bad JSON) was
// still billed, and the free-meeting spend ceiling sums estimated_cost.
export function usageTotals(attempts: AttemptEntry[]) {
  let input = 0, output = 0, thinking = 0, cost = 0, thinkingKnown = false;
  for (const a of attempts) {
    input += a.input_tokens || 0;
    output += a.output_tokens || 0;
    if (typeof a.thinking_tokens === 'number') { thinking += a.thinking_tokens; thinkingKnown = true; }
    cost += estimateCost(a.provider, a.model, a.input_tokens || 0, a.output_tokens || 0);
  }
  return { input, output, thinking: thinkingKnown ? thinking : null, cost: Math.round(cost * 1e6) / 1e6 };
}

const RETRYABLE_TYPES = new Set(['overloaded_error', 'api_error', 'rate_limit_error', 'server_error']);

// Whether to ask the same model again, and how. A cut-off answer is retried
// at lower effort (less thinking, same room); a busy provider after a wait;
// a request refused while using native format (the likeliest cause) with the
// schema pasted instead — if that's refused too, it wasn't the schema. A timeout or a 4xx other
// than a rate limit goes to the fallback model: repeating it only burns the
// time the fallback needs.
type Next = { retry: boolean; effort?: Effort; format?: Format; waitMs?: number };

function decideNext(entry: AttemptEntry, effort: Effort, attemptIndex: number): Next {
  switch (entry.outcome) {
    case 'truncated': {
      if (entry.provider !== 'anthropic') return { retry: false };
      const lower = lowerEffort(effort);
      return lower ? { retry: true, effort: lower } : { retry: false };
    }
    case 'schema_rejected':
      return { retry: true, format: 'pasted' };
    case 'refusal':
    case 'invalid_json':
    case 'missing_fields':
    case 'no_text_block':
      return { retry: true };
    case 'api_error': {
      const s = entry.http_status;
      const busy = s === 408 || s === 409 || s === 429 || (s && s >= 500) || (!s && RETRYABLE_TYPES.has(entry.error_type));
      if (!busy) return { retry: false };
      const backoff = 1_500 * 2 ** attemptIndex + Math.random() * 500;
      return { retry: true, waitMs: entry.retry_after_ms ?? backoff };
    }
    case 'error':
      return { retry: !/not configured|Unknown provider/.test(entry.error || ''), waitMs: 1_000 };
    default: // timeout, stalled, skipped_deadline
      return { retry: false };
  }
}

const sleepFor = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CallSpec = {
  provider: string; model: string; fbProvider?: string | null; fbModel?: string | null;
  systemPrompt: string; userPrompt: string; outputSchema?: Schema | null;
  policy: CallPolicy; temperature: number; retryCount: number; deadlineAt: number;
  // Overridable for tests only.
  fetchImpl?: Fetch; sleep?: (ms: number) => Promise<unknown>; silenceLimitMs?: number;
};

// Tries the primary model up to retryCount+1 times (only retrying when that
// could help), then the fallback model the same way, and records every
// attempt. The primary stops early enough to leave the fallback its reserve.
export async function callWithFallback(spec: CallSpec) {
  const { provider, model, systemPrompt, userPrompt, policy, temperature, retryCount, deadlineAt } = spec;
  const schema = spec.outputSchema || null;
  const fetchImpl = spec.fetchImpl ?? fetch;
  const sleep = spec.sleep ?? sleepFor;
  const silenceLimitMs = spec.silenceLimitMs ?? SILENCE_LIMIT_MS;
  // The same model twice is a retry, not a fallback.
  const hasFallback = !!(spec.fbProvider && spec.fbModel) && !(spec.fbProvider === provider && spec.fbModel === model);
  const attempts: AttemptEntry[] = [];
  let lastError: string | null = null;

  const tryOnce = async (p: string, m: string, isFallback: boolean, effort: Effort, format: Format, endBy: number, waited: number) => {
    const where = `${p}/${m}${isFallback ? ' (fallback)' : ''}`;
    const maxTokens = maxOutputFor(p, m, p === 'anthropic' ? policy.maxTokens.anthropic : policy.maxTokens.openai);
    const entry: AttemptEntry = { n: attempts.length + 1, provider: p, model: m, fallback: isFallback, max_tokens: maxTokens, format: schema ? format : null };
    if (waited) entry.waited_before_ms = Math.round(waited);
    if (p === 'anthropic') {
      const s = claudeSettings(m, policy.thinking, effort);
      entry.thinking = s.label;
      entry.effort = s.effort ?? null;
    }
    attempts.push(entry);

    const now = Date.now();
    if (endBy - now < MIN_ATTEMPT_MS) {
      entry.outcome = 'skipped_deadline';
      // The real failure stays the headline (error_code, the 503 reason, the
      // provider-health alert); running out of time is noted after it.
      lastError = lastError ? `${lastError}; ${where} not attempted, out of time` : `${where}: not attempted, out of time`;
      return null;
    }
    const attemptEnd = policy.attemptTimeoutMs ? Math.min(endBy, now + policy.attemptTimeoutMs) : endBy;
    const system = format === 'pasted' && schema ? systemPrompt + pastedSchemaText(schema) : systemPrompt;
    try {
      const adapter = PROVIDERS[p];
      if (!adapter) throw new Error(`Unknown provider: ${p}`);
      const raw = await adapter({
        model: m, systemPrompt: system, userPrompt, schema, format, maxTokens, temperature,
        thinking: policy.thinking, effort, endBy: attemptEnd, fetchImpl, silenceLimitMs,
      });
      const elapsed = Date.now() - now;
      const truncated = raw.stopReason === 'max_tokens' || raw.stopReason === 'length';
      Object.assign(entry, {
        latency_ms: elapsed, ttfb_ms: raw.ttfbMs, max_silence_ms: raw.maxSilenceMs,
        stop_reason: raw.stopReason, truncated, content_blocks: raw.contentBlocks,
        input_tokens: raw.inputTokens, output_tokens: raw.outputTokens, thinking_tokens: raw.thinkingTokens,
        visible_tokens: raw.thinkingTokens == null ? null : Math.max(0, raw.outputTokens - raw.thinkingTokens),
      });
      const genMs = raw.ttfbMs != null ? elapsed - raw.ttfbMs : elapsed;
      if (raw.outputTokens && genMs > 0) entry.tokens_per_s = Math.round((raw.outputTokens / genMs) * 10_000) / 10;

      if (raw.refusal || raw.stopReason === 'refusal' || raw.stopReason === 'content_filter') {
        entry.outcome = 'refusal';
        entry.refusal_category = raw.refusal?.category ?? null;
        if (raw.refusal?.explanation) entry.refusal_explanation = String(raw.refusal.explanation).slice(0, PREVIEW_CHARS);
        if (raw.content) entry.reply_preview = raw.content.slice(0, PREVIEW_CHARS);
        lastError = `${where}: declined to answer (${raw.refusal?.category || 'no category given'})`;
      } else if (truncated) {
        entry.outcome = 'truncated';
        if (raw.content) entry.reply_preview = raw.content.slice(0, PREVIEW_CHARS);
        lastError = `${where}: response cut off at ${maxTokens} tokens (${raw.stopReason})`;
      } else {
        const v = validateAndParse(raw.content, schema, format === 'pasted');
        if (v.valid) {
          entry.outcome = 'ok';
          return {
            response: v.parsed, provider_used: p, model_used: m, used_fallback: isFallback, latency_ms: elapsed,
            input_tokens: raw.inputTokens, output_tokens: raw.outputTokens, thinking_tokens: raw.thinkingTokens,
          };
        }
        entry.outcome = v.reason;
        if (v.missing) entry.missing_fields = v.missing;
        if (raw.content) entry.reply_preview = raw.content.slice(0, PREVIEW_CHARS);
        lastError = `${where}: ` + (v.reason === 'missing_fields' ? `missing required fields: ${v.missing!.join(', ')}`
          : v.reason === 'no_text_block' ? `no text in response (blocks: ${(raw.contentBlocks || []).join(', ') || 'none'})`
          : 'invalid response format');
      }
    } catch (e) {
      const f = e as CallFailure;
      entry.latency_ms = Date.now() - now;
      if (f.maxSilenceMs != null) entry.max_silence_ms = f.maxSilenceMs;
      if (f.partial) {
        entry.input_tokens = f.partial.inputTokens;
        entry.output_tokens = f.partial.outputTokens;
        entry.usage_estimated = f.partial.estimated;
      }
      entry.outcome = f.aborted ? f.aborted : f.schemaRejected ? 'schema_rejected' : f.httpStatus || f.errorType ? 'api_error' : 'error';
      if (f.httpStatus) entry.http_status = f.httpStatus;
      if (f.errorType) entry.error_type = f.errorType;
      if (f.retryAfterMs != null) entry.retry_after_ms = Math.round(f.retryAfterMs);
      if (f.preview) entry.reply_preview = f.preview;
      entry.error = String(f.message || e).slice(0, 200);
      lastError = `${where}: ` + (f.aborted === 'timeout' ? `timed out after ${entry.latency_ms}ms`
        : f.aborted === 'stalled' ? `stalled (no data for ${silenceLimitMs / 1000}s) after ${entry.latency_ms}ms`
        : f.message);
    }
    console.error(`Attempt ${entry.n} ${lastError}`);
    return null;
  };

  const runModel = async (p: string, m: string, isFallback: boolean) => {
    const endBy = !isFallback && hasFallback ? deadlineAt - policy.fallbackReserveMs : deadlineAt;
    let effort = policy.effort;
    let format: Format = policy.nativeFormat && schema
      && (p !== 'anthropic' || (claudeStructuredOutputs(m) && fitsAnthropicLimits(schema))) ? 'native' : 'pasted';
    let waited = 0;
    for (let i = 0; i <= retryCount; i++) {
      const result = await tryOnce(p, m, isFallback, effort, format, endBy, waited);
      if (result) return result;
      if (i === retryCount) break;
      const next = decideNext(attempts[attempts.length - 1], effort, i);
      if (!next.retry) break;
      effort = next.effort ?? effort;
      format = next.format ?? format;
      waited = 0;
      if (next.waitMs) {
        if (next.waitMs > MAX_WAIT_MS || Date.now() + next.waitMs + MIN_ATTEMPT_MS > endBy) break;
        await sleep(next.waitMs);
        waited = next.waitMs;
      }
    }
    return null;
  };

  let result = await runModel(provider, model, false);
  if (!result && hasFallback) result = await runModel(spec.fbProvider!, spec.fbModel!, true);
  // Set inside tryOnce, which TypeScript's narrowing can't see.
  return { result, attempts, lastError: lastError as string | null };
}

// Inserts one ai_usage_logs row. A deploy can land before the migration that
// adds a newer column (or before PostgREST's schema cache catches up): retry
// without the newer columns rather than lose the row — cost tracking, the
// free-meeting spend ceiling and the provider-health alerts all read it.
// deno-lint-ignore no-explicit-any
export async function insertUsageLog(db: any, row: Record<string, unknown>) {
  try {
    let { error } = await db.from('ai_usage_logs').insert(row);
    if (error && (error.code === 'PGRST204' || error.code === '42703')) {
      const { attempts: _a, model_substitution: _m, anonymous: _anon, thinking_size: _t, ...core } = row;
      ({ error } = await db.from('ai_usage_logs').insert(core));
    }
    if (error) console.error('Usage log failed:', error.message);
  } catch (e) { console.error('Usage log failed:', (e as Error).message); }
}
