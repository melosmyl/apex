// The call core against fake providers: no network, no spend. Each fake
// Anthropic reply is a real SSE stream in the order the API sends it, so the
// official SDK parses it exactly as it would a live one.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { callWithFallback, insertUsageLog, usageTotals } from './llmCall.ts';
import { legacyPolicy, policyFor } from './callPolicy.ts';
import { INDEPENDENT_SCHEMA } from './answerSchemas.ts';

Deno.env.set('ANTHROPIC_API_KEY', 'test-key');
Deno.env.set('OPENAI_API_KEY', 'test-key');

const ANSWER = {
  position: 'Ship it', recommendation: 'Call three customers this week', key_arguments: ['a'], assumptions: [],
  risks: [], missing_information: [{ detail: 'Who pays?', profile_field: 'business_model' }], suggested_actions: [], confidence_score: 70,
};

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;
type Reply = (body: Record<string, unknown>, init: RequestInit) => Response;
type Sent = { url: string; body: Record<string, unknown> };

function fakeFetch(anthropic: Reply[], openai: Reply[] = []) {
  const sent: Sent[] = [];
  const impl = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(String(init?.body ?? '{}'));
    sent.push({ url, body });
    const queue = url.includes('anthropic') ? anthropic : openai;
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return Promise.resolve(next(body, init ?? {}));
  };
  return { fetchImpl: impl as typeof fetch, sent };
}

const sseLine = (e: Record<string, unknown>) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;

function claudeStream({ text = JSON.stringify(ANSWER), stopReason = 'end_turn', stopDetails = null as unknown,
  inputTokens = 1000, outputTokens = 500, thinkingTokens = 300, midError = null as string | null } = {}): Reply {
  return (body) => {
    const events: Record<string, unknown>[] = [
      { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, content: [],
        stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'ping' },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(0, 10) } },
    ];
    let out = events.map(sseLine).join('');
    if (midError) {
      out += `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: midError, message: 'Overloaded' } })}\n\n`;
    } else {
      out += [
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(10) } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null, stop_details: stopDetails },
          usage: { output_tokens: outputTokens, output_tokens_details: { thinking_tokens: thinkingTokens } } },
        { type: 'message_stop' },
      ].map(sseLine).join('');
    }
    return new Response(out, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_1' } });
  };
}

function claudeError(status: number, type: string, message: string, headers: Record<string, string> = {}): Reply {
  return () => new Response(JSON.stringify({ type: 'error', error: { type, message } }),
    { status, headers: { 'content-type': 'application/json', 'request-id': 'req_e', ...headers } });
}

// A stream that sends its first event, then nothing, until the request is aborted.
function claudeHang(): Reply {
  return (body, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(ctl) {
        ctl.enqueue(new TextEncoder().encode(sseLine({ type: 'message_start', message: { id: 'msg_h', type: 'message', role: 'assistant',
          model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 800, output_tokens: 1 } } })));
        init.signal?.addEventListener('abort', () => ctl.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}

function openaiReply(content: string | null, extra: Record<string, unknown> = {}): Reply {
  return () => Response.json({
    choices: [{ message: { content, refusal: null, ...extra }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 900, completion_tokens: 400 },
  });
}

const sleeps: number[] = [];
const fakeSleep = (ms: number) => { sleeps.push(ms); return Promise.resolve(); };

function spec(fetchImpl: typeof fetch, over: Record<string, unknown> = {}) {
  return {
    provider: 'anthropic', model: 'claude-sonnet-5', fbProvider: 'openai', fbModel: 'gpt-4o',
    systemPrompt: 'You are an advisor.', userPrompt: 'Question?', outputSchema: INDEPENDENT_SCHEMA,
    policy: policyFor('independent')!, temperature: 0.7, retryCount: 1, deadlineAt: Date.now() + 120_000,
    fetchImpl, sleep: fakeSleep, ...over,
  };
}

Deno.test('a Claude answer streams in with native format, explicit thinking, and its thinking tokens logged', async () => {
  const { fetchImpl, sent } = fakeFetch([claudeStream()]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl));
  assertEquals(result?.response, ANSWER);
  assertEquals(result?.used_fallback, false);
  const req = sent[0].body as Body;
  assertEquals(req.stream, true);
  assertEquals(req.thinking, { type: 'adaptive' });
  assertEquals(req.output_config.effort, 'high');
  assertEquals(req.output_config.format.type, 'json_schema');
  assertEquals(req.output_config.format.schema.additionalProperties, false);
  assertEquals(req.max_tokens, 16_000);
  assertEquals('temperature' in req, false);
  assert(!String(req.system).includes('JSON structure'), 'native calls do not paste the schema');
  const a = attempts[0];
  assertEquals([a.outcome, a.format, a.thinking, a.effort], ['ok', 'native', 'adaptive', 'high']);
  assertEquals([a.input_tokens, a.output_tokens, a.thinking_tokens, a.visible_tokens], [1000, 500, 300, 200]);
  assert(typeof a.ttfb_ms === 'number' && typeof a.max_silence_ms === 'number');
});

Deno.test('a cut-off Claude answer is retried on Claude at lower effort, not handed to GPT-4o', async () => {
  const { fetchImpl, sent } = fakeFetch([claudeStream({ text: '{"position": "Ship', stopReason: 'max_tokens' }), claudeStream()]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl));
  assertEquals(result?.model_used, 'claude-sonnet-5');
  assertEquals(attempts.map((a) => [a.outcome, a.effort]), [['truncated', 'high'], ['ok', 'medium']]);
  assertEquals((sent[1].body as Body).output_config.effort, 'medium');
  assertEquals(attempts[0].reply_preview, '{"position": "Ship');
});

Deno.test('a busy Claude is retried after the wait it asks for', async () => {
  sleeps.length = 0;
  const { fetchImpl } = fakeFetch([claudeError(529, 'overloaded_error', 'Overloaded', { 'retry-after': '2' }), claudeStream()]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl));
  assertEquals(result?.provider_used, 'anthropic');
  assertEquals([attempts[0].outcome, attempts[0].http_status, attempts[0].error_type, attempts[0].retry_after_ms], ['api_error', 529, 'overloaded_error', 2000]);
  assertEquals(sleeps, [2000]);
  assertEquals(attempts[1].waited_before_ms, 2000);
});

Deno.test('an error in the middle of the reply is retried, and what streamed is counted', async () => {
  sleeps.length = 0;
  const { fetchImpl } = fakeFetch([claudeStream({ midError: 'overloaded_error' }), claudeStream()]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl));
  assertEquals(result?.provider_used, 'anthropic');
  assertEquals([attempts[0].outcome, attempts[0].http_status, attempts[0].error_type], ['api_error', undefined, 'overloaded_error']);
  assertEquals([attempts[0].input_tokens, attempts[0].usage_estimated], [1000, true]);
  assertEquals(sleeps.length, 1);
});

Deno.test('a refusal is recorded as one, retried once, then GPT-4o answers', async () => {
  const refusal = claudeStream({ text: '', stopReason: 'refusal', stopDetails: { type: 'refusal', category: 'cyber', explanation: 'x' } });
  const { fetchImpl, sent } = fakeFetch([refusal, refusal], [openaiReply(JSON.stringify(ANSWER))]);
  const { result, attempts, lastError } = await callWithFallback(spec(fetchImpl));
  assertEquals(result?.used_fallback, true);
  assertEquals(attempts.map((a) => a.outcome), ['refusal', 'refusal', 'ok']);
  assertEquals(attempts[0].refusal_category, 'cyber');
  assert(lastError?.includes('declined to answer (cyber)'));
  const oa = sent[2].body as Body;
  assertEquals(oa.response_format.type, 'json_schema');
  assertEquals(oa.response_format.json_schema.strict, true);
  assertEquals(oa.max_tokens, 8_000);
});

Deno.test('a rejected schema is retried with the schema pasted into the prompt instead', async () => {
  const { fetchImpl, sent } = fakeFetch([claudeError(400, 'invalid_request_error', 'output_config.format.schema: too many optional properties'), claudeStream()]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl));
  assertEquals(result?.provider_used, 'anthropic');
  assertEquals(attempts.map((a) => [a.outcome, a.format]), [['schema_rejected', 'native'], ['ok', 'pasted']]);
  const retry = sent[1].body as Body;
  assertEquals(retry.output_config.format, undefined);
  assert(String(retry.system).includes('JSON structure'));
});

Deno.test('a stuck stream is cut off by silence, logged with what it used, and GPT-4o answers', async () => {
  const { fetchImpl } = fakeFetch([claudeHang()], [openaiReply(JSON.stringify(ANSWER))]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl, { silenceLimitMs: 1_500 }));
  assertEquals(result?.used_fallback, true);
  assertEquals(attempts[0].outcome, 'stalled');
  assertEquals([attempts[0].input_tokens, attempts[0].usage_estimated], [800, true]);
  // ~2s spent generating with no visible text: thinking is still counted.
  assert(attempts[0].output_tokens >= 250, `estimated output ${attempts[0].output_tokens}`);
  assertEquals(attempts.length, 2, 'a stall is not retried on the same model');
});

Deno.test('the primary leaves the fallback its reserved time', async () => {
  // 22s left, 20s reserved for the fallback: too little for Claude to start.
  const { fetchImpl, sent } = fakeFetch([], [openaiReply(JSON.stringify(ANSWER))]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl, { deadlineAt: Date.now() + 22_000 }));
  assertEquals(result?.used_fallback, true);
  assertEquals(attempts.map((a) => a.outcome), ['skipped_deadline', 'ok']);
  assertEquals(sent.length, 1);
});

Deno.test('GPT-4o refusals are recorded as refusals', async () => {
  const { fetchImpl } = fakeFetch([], [openaiReply(null, { refusal: "I can't help with that." }), openaiReply(JSON.stringify(ANSWER))]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl, { provider: 'openai', model: 'gpt-4o', fbProvider: null, fbModel: null }));
  assertEquals(result?.provider_used, 'openai');
  assertEquals(attempts.map((a) => a.outcome), ['refusal', 'ok']);
  assertEquals(attempts[0].refusal_explanation, "I can't help with that.");
});

Deno.test('calls without a policy keep their pasted schema and asked-for length', async () => {
  const { fetchImpl, sent } = fakeFetch([], [openaiReply(JSON.stringify({ tags: ['x'] }))]);
  const schema = { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } }, required: ['tags'] };
  const { result } = await callWithFallback(spec(fetchImpl, {
    provider: 'openai', model: 'gpt-4o-mini', fbProvider: null, fbModel: null, outputSchema: schema, policy: legacyPolicy(400, 60_000),
  }));
  assertEquals(result?.response, { tags: ['x'] });
  const req = sent[0].body as Body;
  assertEquals(req.response_format, { type: 'json_object' });
  assertEquals(req.max_tokens, 400);
  assert(String((req.messages as Body[])[0].content).includes('JSON structure'));
});

Deno.test('the same model is never its own fallback', async () => {
  const { fetchImpl } = fakeFetch([claudeError(401, 'authentication_error', 'invalid x-api-key')]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl, { fbProvider: 'anthropic', fbModel: 'claude-sonnet-5' }));
  assertEquals(result, null);
  assertEquals(attempts.length, 1, 'a rejected key is not retried, and there is no other model');
});

Deno.test('usage is priced at the real rates, thinking counted apart', () => {
  const t = usageTotals([
    { provider: 'anthropic', model: 'claude-sonnet-5', input_tokens: 1_000_000, output_tokens: 1_000_000, thinking_tokens: 600_000 },
    { provider: 'openai', model: 'gpt-4o', input_tokens: 1_000_000, output_tokens: 1_000_000 },
  ]);
  assertEquals(t.cost, 2 + 10 + 2.5 + 10);
  assertEquals(t.thinking, 600_000);
  assertEquals(usageTotals([{ provider: 'openai', model: 'gpt-4o', input_tokens: 10, output_tokens: 10 }]).thinking, null);
});

Deno.test('a usage row is kept when the newer columns are not there yet', async () => {
  const inserted: Record<string, unknown>[] = [];
  const db = { from: () => ({ insert: (row: Record<string, unknown>) => {
    inserted.push(row);
    return Promise.resolve({ error: 'thinking_size' in row ? { code: 'PGRST204', message: 'no column' } : null });
  } }) };
  await insertUsageLog(db, { provider: 'openai', model: 'gpt-4o', thinking_size: 5, attempts: [], estimated_cost: 0.1 });
  assertEquals(inserted.length, 2);
  assertEquals(inserted[1], { provider: 'openai', model: 'gpt-4o', estimated_cost: 0.1 });
});

Deno.test('a Claude model without structured outputs gets the schema pasted from the start', async () => {
  const { fetchImpl, sent } = fakeFetch([claudeStream()]);
  const { result, attempts } = await callWithFallback(spec(fetchImpl, { model: 'claude-sonnet-4-6' }));
  assertEquals(result?.model_used, 'claude-sonnet-4-6');
  assertEquals(attempts[0].format, 'pasted');
  assertEquals((sent[0].body as Body).output_config.format, undefined);
});

Deno.test("gpt-4o's zero reasoning tokens aren't logged as thinking", async () => {
  const reply: Reply = () => Response.json({
    choices: [{ message: { content: JSON.stringify(ANSWER), refusal: null }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 9, completion_tokens: 4, completion_tokens_details: { reasoning_tokens: 0 } },
  });
  const { fetchImpl } = fakeFetch([], [reply]);
  const { attempts } = await callWithFallback(spec(fetchImpl, { provider: 'openai', model: 'gpt-4o', fbProvider: null, fbModel: null }));
  assertEquals([attempts[0].thinking_tokens, attempts[0].visible_tokens], [null, null]);
  assertEquals(usageTotals(attempts).thinking, null);
});
