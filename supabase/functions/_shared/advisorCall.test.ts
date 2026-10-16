import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { AdvisorCallError, callAdvisorWithRetry } from './advisorCall.ts';
import { findFailures } from './providerHealth.ts';

// Answers in order; records the usage rows written.
function setup(answers: Array<Response | Error>) {
  const rows: any[] = [];
  let calls = 0;
  const fetchImpl = (async () => {
    const a = answers[Math.min(calls++, answers.length - 1)];
    if (a instanceof Error) throw a;
    return a;
  }) as unknown as typeof fetch;
  const db = { from: () => ({ insert: async (row: any) => { rows.push(row); return { error: null }; } }) };
  return { rows, fetchImpl, db, count: () => calls };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const payload = { advisor_id: 'a', meeting_id: 'm', request_type: 'discussion_round_3', deadline_at: Date.now() + 120_000 };
const opts = (s: any) => ({ db: s.db, fetchImpl: s.fetchImpl, sleep: async () => {}, provider: 'anthropic', model: 'claude-sonnet-5-5' });

Deno.test('a gateway error page is logged, then tried again, and the advisor answers', async () => {
  const s = setup([new Response('<html>546 WORKER_LIMIT</html>', { status: 546 }), ok({ response: { message: 'hi' } })]);
  const data = await callAdvisorWithRetry('http://x', 'k', payload, opts(s));
  assertEquals([data.response.message, data.retried, s.count()], ['hi', true, 2]);
  assertEquals(s.rows.length, 1);
  assert(s.rows[0].status === 'error' && s.rows[0].error_code.includes('before reaching the model') && s.rows[0].error_code.includes('546') && s.rows[0].provider === 'internal');
  // The provider alert doesn't count it against Claude or OpenAI.
  assertEquals(findFailures(s.rows), []);
});

Deno.test("a call that reached the model and failed there (already retried and logged) isn't paid for again", async () => {
  const fail = () => new Response(JSON.stringify({ error: 'This advisor was temporarily unavailable.', reason: 'Anthropic error: HTTP 529 — Overloaded' }), { status: 503 });
  const s = setup([fail(), fail()]);
  const e = await assertRejects(() => callAdvisorWithRetry('http://x', 'k', payload, opts(s)), AdvisorCallError);
  assertEquals([s.count(), s.rows.length, (e as AdvisorCallError).reason], [1, 0, 'Anthropic error: HTTP 529 — Overloaded']);
});

Deno.test('a refusal is not tried again, and not logged as a failure', async () => {
  const s = setup([new Response(JSON.stringify({ error: 'Advisor not found' }), { status: 404 })]);
  await assertRejects(() => callAdvisorWithRetry('http://x', 'k', payload, opts(s)));
  assertEquals([s.count(), s.rows.length], [1, 0]);
});

Deno.test('with too little time left, there is no second try', async () => {
  const s = setup([new Response('', { status: 502 }), ok({})]);
  await assertRejects(() => callAdvisorWithRetry('http://x', 'k', { ...payload, deadline_at: Date.now() + 20_000 }, opts(s)));
  assertEquals([s.count(), s.rows.length], [1, 1]);
});

Deno.test('a dropped connection is tried again', async () => {
  const s = setup([new TypeError('connection reset'), ok({ response: { message: 'back' } })]);
  const data = await callAdvisorWithRetry('http://x', 'k', payload, opts(s));
  assertEquals([data.response.message, s.rows[0].error_code.includes("didn't connect")], ['back', true]);
});
