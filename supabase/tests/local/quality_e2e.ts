// The board's quality fixes (owner, 15 October 2026), on the local stack
// against fake providers ($0):
// - the resolution is Claude's or nobody's: with Claude out of credit, the
//   meeting stops with a plain message and is never resolved by GPT-4o;
// - the provider alert names the failing provider and why, and emails the
//   owner once per incident;
// - Round 1: each advisor answers from their own lens, sees only their own
//   commitments, and near-identical answers are asked again.
// Setup as in README.md (fake.env also sets RESEND_API_URL to the fake).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `quality-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await F.auth.signInWithPassword({ email, password });
const uid = s.user!.id, token = s.session!.access_token;
const call = async (name: string, body: unknown, bearer = token) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const row = async (id: string) => (await admin.from('board_meetings').select('*').eq('id', id).maybeSingle()).data;
const waitFor = async (id: string, done: (m: any) => boolean, ms = 180_000) => {
  const end = Date.now() + ms;
  for (;;) { const m = await row(id); if (m && done(m) || Date.now() > end) return m; await sleep(500); }
};
const finished = (m: any) => ['complete', 'failed'].includes(m.status);
const script = (body: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(body) });
const fakeLog = async () => (await (await fetch(`${FAKE}/__log`)).json());

// A board whose debaters are all on GPT-4o and whose Chair is on Claude.
const { data: co } = await F.from('companies').insert({ name: `petit ${tag}`, created_by_id: uid }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, marcus: `Marcus ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair, default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.grace, role: 'Customer Advocate' }, { name: names.marcus, role: 'Finance Director' }, { name: names.priya, role: 'Product Strategist' },
].map((m) => ({ company_id: co.id, created_by_id: uid, type: 'ai', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'anthropic', fallback_model: 'claude-sonnet-5', ...m }))).select();
const byName = (n: string) => advs!.find((a: any) => a.name === n);
const debaters = [names.grace, names.marcus, names.priya].map((n) => byName(n).id);
const start = async (question: string) => {
  const id = crypto.randomUUID();
  await call('startBoardMeeting', { company_id: co.id, question, advisor_ids: debaters, meeting_id: id, server_driven: true });
  return id;
};

// ---- 1. Claude is out of credit: no resolution by GPT-4o.
console.log('== Claude is down');
await admin.from('provider_health_alerts').delete().eq('provider', 'anthropic').eq('alert_type', 'error');
await script({ anthropic: Array(60).fill('credit400') });
const A = await start('Should we open a shop?');
const mA = await waitFor(A, finished);
check(mA?.status === 'failed' && /Claude, who writes every resolution, couldn't be reached/.test(mA?.failure_reason || ''), 'the meeting stops and says Claude is unavailable', [mA?.status, mA?.failure_reason]);
const { data: chairLogs } = await admin.from('ai_usage_logs').select('provider, model, status, request_type').eq('meeting_id', A).in('request_type', ['chair_synthesis', 'chair_repair']);
check((chairLogs || []).length >= 1 && chairLogs!.every((l: any) => l.provider === 'anthropic' && l.status === 'error'), 'the resolution was never handed to GPT-4o', chairLogs);
const { data: opening } = await admin.from('ai_usage_logs').select('provider, status').eq('meeting_id', A).eq('request_type', 'chair_opening');
check(opening?.[0]?.status === 'fallback_used' && opening[0].provider === 'openai', "the Chair's opening may still fall back (it isn't the resolution)", opening);

console.log('\n== the owner is told');
const h1 = await call('providerHealth', { action: 'check' }, SERVICE);
const a1 = (h1.json?.alerts || []).find((a: any) => a.provider === 'anthropic');
check(a1?.reason === 'credit' && a1?.email === 'sent', 'the alert names Claude and the reason, and emails the owner', h1.json);
const { data: alertRow } = await admin.from('provider_health_alerts').select('*').eq('provider', 'anthropic').eq('alert_type', 'error').maybeSingle();
check(/Claude \(Anthropic\) has failed/.test(alertRow?.message || '') && /top it up in the Anthropic console/.test(alertRow?.message || '') && !!alertRow?.emailed_at && !alertRow?.acknowledged,
  'the Admin page alert says who, why and what to do', alertRow?.message);
// Earlier local suites may have left real fake failures from OpenAI too:
// only the Claude email is this test's.
const claudeMail = (l: any) => l.kind === 'email' && /Claude/.test(l.subject);
const mails = (await fakeLog()).filter(claudeMail);
check(mails.length === 1 && mails[0].subject === 'Action needed: Claude (Anthropic) is out of credit' && JSON.stringify(mails[0].to) === '["owner@example.test"]', 'one email, to the owner, with a plain subject', mails.map((m: any) => [m.subject, m.to]));
const h2 = await call('providerHealth', { action: 'check' }, SERVICE);
const mails2 = (await fakeLog()).filter(claudeMail);
check((h2.json?.alerts || []).find((a: any) => a.provider === 'anthropic')?.email === 'not needed' && mails2.length === 1, 'checking again sends no second email', [h2.json, mails2.length]);
const notMe = await call('providerHealth', { action: 'check' });
check(notMe.status === 401, 'only the server can run the check', notMe.status);

console.log('\n== credit is topped up');
await script({});
const retry = await call('meetingRun', { action: 'retry', meeting_id: A });
const mA2 = await waitFor(A, (m) => m.status === 'complete' || (m.status === 'failed' && m.step_attempts > 0));
const { data: written } = await admin.from('ai_usage_logs').select('provider, status').eq('meeting_id', A).eq('request_type', 'chair_synthesis').eq('status', 'success');
check(retry.json?.step === 'synthesis' && mA2?.status === 'complete' && written?.[0]?.provider === 'anthropic', 'trying again, Claude writes the resolution', [retry.json, mA2?.status, written]);

// ---- 2. Round 1: own lens, own commitments, no copies.
console.log('\n== Round 1 answers are each advisor\'s own');
const { data: past } = await admin.from('board_meetings').insert({ company_id: co.id, created_by_id: uid, question: 'Earlier question', status: 'complete', participants: [], independent_responses: [], challenge_responses: [] }).select().single();
const MINE = `marcus-price-model-${tag}`, OTHER = `founder-call-kiln-${tag}`;
await admin.from('tasks').insert([
  { company_id: co.id, created_by_id: uid, title: MINE, status: 'todo', source_meeting_id: past.id, advisor_id: byName(names.marcus).id, assigned_to: names.marcus },
  { company_id: co.id, created_by_id: uid, title: OTHER, status: 'todo', source_meeting_id: past.id, assigned_to: 'Founder' },
]);
await script({ marks: [MINE, OTHER, 'YOUR LENS', 'other open commitment', 'almost word for word'] });
const B = await start('Should we sell at craft fairs?');
const mB = await waitFor(B, finished);
const log = (await fakeLog()).filter((l: any) => l.kind !== 'embedding' && l.kind !== 'email');
const r1 = log.filter((l: any) => l.marked.includes('YOUR LENS') && !l.marked.includes('almost word for word'));
check(r1.length === 3, 'every Round 1 answer is asked from the advisor\'s own lens', r1.map((l: any) => l.who));
const sawMine = r1.filter((l: any) => l.marked.includes(MINE)).map((l: any) => l.who);
check(JSON.stringify(sawMine) === JSON.stringify([names.marcus]) && r1.every((l: any) => !l.marked.includes(OTHER)) && r1.every((l: any) => l.marked.includes('other open commitment')),
  'each advisor sees only their own commitments, and a note that others exist', [sawMine, r1.map((l: any) => [l.who, l.marked])]);
const chairs = log.filter((l: any) => l.who === names.chair && l.marked.includes(MINE) && l.marked.includes(OTHER));
check(chairs.length >= 1, 'the Chair still sees every open commitment', chairs.length);
const redos = log.filter((l: any) => l.marked.includes('almost word for word'));
const redone = (mB?.independent_responses || []).filter((r: any) => r.redone_after);
check(mB?.status === 'complete' && redos.length === 2 && redone.length === 2, 'identical answers are asked again (at most two), and the meeting finishes', [mB?.status, redos.length, redone.map((r: any) => [r.advisor_name, r.redone_after])]);

// The fake data made for this test is removed.
await script({});
await admin.from('provider_health_alerts').delete().eq('provider', 'anthropic').eq('alert_type', 'error');
await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
