// The founder's call (owner, 16 October 2026): three states. A resolution the
// founder hasn't acted on is still open, never a decision: not in board
// memory, not in the Chair's opening. Local stack, fake providers ($0).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `calls-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await F.auth.signInWithPassword({ email, password });
const uid = s.user!.id, token = s.session!.access_token;
const call = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const row = async (id: string) => (await admin.from('board_meetings').select('*').eq('id', id).maybeSingle()).data;
const script = (body: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(body) });
const fakeLog = async () => (await (await fetch(`${FAKE}/__log`)).json());

const { data: co } = await F.from('companies').insert({ name: `calls ${tag}`, created_by_id: uid }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, marcus: `Marcus ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair }, { name: names.grace, role: 'Customer Advocate' },
  { name: names.marcus, role: 'Finance Director' }, { name: names.priya, role: 'Product Strategist' },
].map((m) => ({ company_id: co.id, created_by_id: uid, type: 'ai', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o', ...m }))).select();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair').map((a: any) => a.id);

// Two past meetings: one never acted on (older), one the founder rejected (the last).
const OPEN_Q = `open-question-${tag}`, OPEN_R = `open-recommendation-${tag}`, REJ_Q = `rejected-question-${tag}`, WHY = `too-far-to-travel-${tag}`;
const { data: m1 } = await admin.from('board_meetings').insert({ company_id: co.id, created_by_id: uid, question: OPEN_Q, status: 'complete', participants: [], independent_responses: [], challenge_responses: [], board_resolution: { recommended_direction: OPEN_R }, created_at: new Date(Date.now() - 2 * 86400000).toISOString() }).select().single();
await sleep(50);
await admin.from('board_meetings').insert({ company_id: co.id, created_by_id: uid, question: REJ_Q, status: 'complete', participants: [], independent_responses: [], challenge_responses: [], board_resolution: { recommended_direction: 'Sign the lease' }, founder_decision: 'reject', founder_decision_notes: WHY, created_at: new Date(Date.now() - 86400000).toISOString() });
// The open one was also put in the Decision Centre (pending: no call yet).
await admin.from('decisions').insert({ company_id: co.id, created_by_id: uid, meeting_id: m1.id, question: OPEN_Q, final_recommendation: OPEN_R, status: 'pending' });

// A third, accepted on the results page, whose Decision Centre record still
// says pending; and a record the founder marked decided by hand.
const ACC_Q = `accepted-question-${tag}`, HAND_Q = `hand-decided-${tag}`, HAND_WORDS = `two-markets-not-one-${tag}`;
const { data: m3 } = await admin.from('board_meetings').insert({ company_id: co.id, created_by_id: uid, question: ACC_Q, status: 'complete', participants: [], independent_responses: [], challenge_responses: [], board_resolution: { recommended_direction: 'Raise prices' }, founder_decision: 'accept', created_at: new Date(Date.now() - 3 * 86400000).toISOString() }).select().single();
await admin.from('decisions').insert([
  { company_id: co.id, created_by_id: uid, meeting_id: m3.id, question: ACC_Q, final_recommendation: 'Raise prices', status: 'pending' },
  { company_id: co.id, created_by_id: uid, question: HAND_Q, final_recommendation: 'One market', status: 'decided', decision_taken: HAND_WORDS },
]);
await script({ marks: [ACC_Q, HAND_WORDS, `${ACC_Q}: The founder ACCEPTED it`, OPEN_Q, OPEN_R, WHY, 'STILL OPEN', "Only the founder's calls are decisions", 'Past decisions related', "The founder's call on it: reject", "Calls the founder hasn't made yet", 'already resolved'] });
const id = crypto.randomUUID();
await call('startBoardMeeting', { company_id: co.id, question: 'Should we open a second stall?', advisor_ids: debaters, meeting_id: id, server_driven: true });
let m: any;
for (let i = 0; i < 200; i++) { m = await row(id); if (m?.status && m.status !== 'preparing') break; await sleep(400); }
const log = await fakeLog();
const opening = log.filter((l: any) => l.who === names.chair && l.marked.includes("The founder's call on it: reject"));
check(opening.length === 1 && opening[0].marked.includes(WHY) && opening[0].marked.includes("Calls the founder hasn't made yet") && opening[0].marked.includes(OPEN_Q) && !opening[0].marked.includes('already resolved'),
  "the Chair's opening states the last call (rejected, with the reason) and names the older call as open", opening.map((l: any) => l.marked));
const r1 = log.filter((l: any) => [names.grace, names.marcus, names.priya].includes(l.who));
check(r1.length >= 3 && r1.every((l: any) => l.marked.includes(OPEN_Q) && l.marked.includes('STILL OPEN') && l.marked.includes("Only the founder's calls are decisions") && !l.marked.includes('Past decisions related')),
  'board memory gives the open resolution as still open, not as a decision', r1.map((l: any) => [l.who, l.marked]));
check(r1.every((l: any) => l.marked.includes(`${ACC_Q}: The founder ACCEPTED it`) && l.marked.includes(HAND_WORDS)),
  "an accepted call counts even if its Decision Centre record says pending; a record decided by hand counts with the founder's words", r1.map((l: any) => l.marked));
const recalled = m?.memory_context?.recalled_decisions || [];
const stateOf = (q: string) => recalled.find((d: any) => d.question === q)?.state;
check(recalled.length === 3 && stateOf(OPEN_Q) === 'open' && stateOf(ACC_Q) === 'accept' && stateOf(HAND_Q) === 'decided', 'the board-memory note knows which are decided and which are open', recalled);

await admin.from('decisions').delete().eq('company_id', co.id);
for (let i = 0; i < 100 && !['complete', 'failed'].includes((await row(id))?.status); i++) await sleep(500);
await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
