// Phase 1b Stage 1, end to end on the local stack against fake providers ($0).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const DB = 'supabase_db_localstack', FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sql = async (q: string) => new TextDecoder().decode((await new Deno.Command('docker', { args: ['exec', '-i', DB, 'psql', '-U', 'postgres', '-tAq', '-c', q] }).output()).stdout).trim();
const rows = async (q: string) => JSON.parse(await sql(`select coalesce(json_agg(t), '[]') from (${q}) t`));
async function user(label: string) {
  const email = `${label}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.signInWithPassword({ email, password });
  return { c, id: data.user!.id, token: data.session!.access_token };
}
const fn = async (token: string, name: string, body: unknown) => {
  const t = Date.now();
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => null);
  console.log(`      ${name}: ${r.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return { status: r.status, json };
};
const script = (s: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(s) }).then((r) => r.json());
const fakeLog = () => fetch(`${FAKE}/__log`).then((r) => r.json());

const F = await user('founder');
const { data: co } = await F.c.from('companies').insert({ name: `stage1 ${tag}`, created_by_id: F.id }).select().single();
const spec = [
  ['chair', 'The Chair', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'],
  ['visionary', 'Visionary', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'],
  ['cfo', 'CFO', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'],
  ['contrarian', 'Contrarian', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'],
];
const { data: advs } = await F.c.from('advisors').insert(spec.map(([k, role, p, m, fp, fm]) => ({
  company_id: co.id, created_by_id: F.id, name: `${role} ${tag}`, role, library_key: k, type: 'ai',
  default_provider: p, default_model: m, fallback_provider: fp, fallback_model: fm, maximum_output_length: 2500, temperature: 0.7,
}))).select();
const ids = advs!.map((a: any) => a.id);
const question = 'so this website and this meeting we are now having is the product I want to get out there...';

async function meeting(label: string) {
  console.log(`\n== ${label}`);
  const s = await fn(F.token, 'startBoardMeeting', { company_id: co.id, question, advisor_ids: ids });
  check(s.status === 200, `${label}: Round 1 ran`, s.json);
  const d = await fn(F.token, 'runBoardDiscussion', { meeting_id: s.json?.meeting_id });
  check(d.status === 200, `${label}: discussion ran`, d.json);
  const r = await fn(F.token, 'runChairSynthesis', { meeting_id: s.json?.meeting_id });
  check(r.status === 200 && r.json?.status === 'complete', `${label}: resolution written`, r.json);
  return { id: s.json?.meeting_id, start: s.json, synth: r.json };
}

// ---- 1. A clean meeting
await script({});
const m1 = await meeting('clean meeting (first meeting, so no Chair opening yet)');
const wire1 = await fakeLog();
const claude = wire1.filter((w: any) => w.provider === 'anthropic');
const gpt = wire1.filter((w: any) => w.provider === 'openai');
check(claude.length > 0 && claude.every((w: any) => w.stream === true && w.temperature === undefined && w.thinking?.type === 'adaptive' && w.effort === 'high' && w.native && !w.pasted),
  'every Claude request streams, states adaptive thinking and effort high, sends no temperature, uses native format', claude);
check(gpt.length > 0 && gpt.every((w: any) => w.format === 'json_schema' && w.strict === true), 'every GPT-4o meeting request uses strict json_schema', gpt);
check(new Set(claude.map((w: any) => w.max_tokens)).has(16000) && new Set(claude.map((w: any) => w.max_tokens)).has(64000), 'Claude limits: 16,000 for debaters, 64,000 for the resolution', claude.map((w: any) => w.max_tokens));
check(gpt.every((w: any) => w.max_tokens === 8000), 'GPT-4o debater limit 8,000', gpt.map((w: any) => w.max_tokens));
const r1 = m1.start?.independent_responses?.find((x: any) => x.missing_information?.length);
check(r1?.missing_information?.[0]?.profile_field === 'business_model', 'Round 1 keeps a known profile field', r1?.missing_information);
const logs1 = await rows(`select request_type, provider, model, status, output_size, thinking_size, estimated_cost, attempts from ai_usage_logs where meeting_id='${m1.id}' order by created_at`);
check(logs1.length > 0 && logs1.every((l: any) => l.status === 'success'), 'every call succeeded first time', logs1.map((l: any) => [l.request_type, l.status]));
const cl = logs1.filter((l: any) => l.provider === 'anthropic');
check(cl.every((l: any) => Number(l.thinking_size) === 120 && l.attempts[0].thinking === 'adaptive' && l.attempts[0].visible_tokens === l.attempts[0].output_tokens - 120 && typeof l.attempts[0].ttfb_ms === 'number'),
  'Claude rows log thinking_size, thinking setting, visible tokens and time to first word', cl.map((l: any) => [l.thinking_size, l.attempts[0]]));
check(logs1.filter((l: any) => l.provider === 'openai').every((l: any) => l.thinking_size === null), 'GPT-4o rows have no thinking_size');
const one = cl[0];
const expect = (one.attempts[0].input_tokens * 2 + one.attempts[0].output_tokens * 10) / 1e6;
check(Math.abs(Number(one.estimated_cost) - expect) < 1e-6, `Sonnet 5 priced at $2/$10 (${one.estimated_cost})`, { expect });
const rtypes = new Set(logs1.map((l: any) => l.request_type));
check(rtypes.has('independent') && rtypes.has('discussion_round_2') && rtypes.has('chair_synthesis'), 'request types logged', [...rtypes]);

// ---- 2. A meeting where Claude misbehaves
// Parallel calls take these in any order; the rejected schema is checked on
// a single call below, where its retry is certain to be the next attempt.
await script({ anthropic: ['overload529', 'midstream', 'truncate', 'refusal', 'refusal'] });
const m2 = await meeting('meeting with Claude overloaded, cut off, refusing and rejecting the schema');
check(typeof m2.start?.chair_opening === 'string' && m2.start.chair_opening.length > 0, 'second meeting has a Chair opening', m2.start?.chair_opening);
const logs2 = await rows(`select request_type, provider, status, attempts from ai_usage_logs where meeting_id='${m2.id}' order by created_at`);
const atts = logs2.flatMap((l: any) => l.attempts.map((a: any) => ({ ...a, rt: l.request_type })));
const outcomes = atts.map((a: any) => a.outcome);
for (const o of ['api_error', 'truncated', 'refusal']) check(outcomes.includes(o), `${o} recorded as its own outcome`, outcomes);
const busy = atts.filter((a: any) => a.outcome === 'api_error');
check(busy.some((a: any) => a.http_status === 529 && a.retry_after_ms === 1000), 'the 529 recorded with its retry-after', busy);
check(busy.some((a: any) => a.error_type === 'overloaded_error' && !a.http_status && a.usage_estimated), 'the mid-reply overload recorded, its partial usage estimated', busy);
const afterTrunc = atts[atts.findIndex((a: any) => a.outcome === 'truncated') + 1];
check(afterTrunc?.provider === 'anthropic' && afterTrunc?.effort === 'medium', 'after a cut-off, Claude again at effort medium', afterTrunc);
check(atts.some((a: any) => a.outcome === 'refusal' && a.refusal_category === 'general_harms'), 'refusal category kept');
check(logs2.some((l: any) => l.status === 'fallback_used'), 'two refusals in a row went to the fallback', logs2.map((l: any) => [l.request_type, l.status]));
check(atts.filter((a: any) => a.outcome !== 'ok').every((a: any) => 'reply_preview' in a || a.outcome === 'refusal' || a.outcome === 'api_error'), 'failed replies keep a preview');
check(m2.synth?.status === 'complete', 'the meeting still finished');

// ---- 3. Admin test, task acknowledgment, onboarding plan
console.log('\n== other calls');
const A = await user('admin');
await sql(`update public.profiles set role='admin' where id='${A.id}'`);
await script({});
const t = await fn(A.token, 'testAdvisor', { advisor_id: ids[1], question: 'Test question' });
check(t.status === 200 && !!t.json?.response?.position, 'admin Test advisor works through the shared prompt builder', t.json);
await script({ anthropic: ['reject400'] });
const rj = await fn(A.token, 'testAdvisor', { advisor_id: ids[1], question: 'Test question' });
const rjWire = await fakeLog();
check(rj.status === 200 && rj.json?.provider_used === 'anthropic' && rjWire.length === 2 && rjWire[0].native && rjWire[1].pasted && !rjWire[1].native,
  'a rejected schema is retried on Claude with the schema pasted into the prompt', rjWire);
await script({});
const tl = await rows(`select attempts, thinking_size from ai_usage_logs where request_type='admin_test' and user_id='${A.id}'`);
check(tl[0]?.attempts?.[0]?.max_tokens === 16000 && Number(tl[0]?.thinking_size) === 120, 'Test advisor uses the debater policy', tl);
const { data: task } = await admin.from('tasks').select('id').eq('source_meeting_id', m1.id).limit(1).maybeSingle();
if (task) {
  await admin.from('tasks').update({ status: 'done' }).eq('id', task.id);
  const ack = await fn(F.token, 'acknowledgeTaskCompletion', { task_id: task.id });
  check(ack.status === 200 && !!ack.json?.advisor_acknowledgment, 'task acknowledgment works', ack.json);
} else check(false, 'resolution created tasks');
const ob = await fn(F.token, 'generateOnboardingPlan', { answers: { idea: 'AI board for founders', stage: 'pre-launch' } });
check(ob.status === 200 && Array.isArray(ob.json?.recommended_advisors) && !!ob.json.recommended_advisors[0]?.reason, 'onboarding plan works with strict schema', ob.json);
const obw = (await fakeLog()).find((w: any) => w.provider === 'openai' && w.max_tokens === 8000 && w.format === 'json_schema');
check(!!obw, 'onboarding plan: GPT-4o, 8,000 limit, strict schema');

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
