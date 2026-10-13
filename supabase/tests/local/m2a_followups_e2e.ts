// M2a follow-ups, end to end on the local stack against fake providers ($0):
// what a task run is told (only the company record for product facts, the
// meeting's open questions as unknowns), archived documents kept out of
// meetings and task runs, the fallback model recorded on a result, and a
// hand-made Draft/Plan task that "Do this for me" can run. Setup as in
// README.md.
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
const script = (s: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(s) });
const fakeLog = async () => (await fetch(`${FAKE}/__log`)).json();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LIVE = `LIVE-DOC-${tag}`, ARCHIVED = `ARCHIVED-DOC-${tag}`, OLD_DELIVERABLE = `ARCHIVED-DELIV-${tag}`, OPEN = `MATERIAL-OPEN-${tag}`;
const MARKS = [LIVE, ARCHIVED, OLD_DELIVERABLE, OPEN];

const email = `m2af-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: session } = await F.auth.signInWithPassword({ email, password });
const uid = session.user!.id, token = session.session!.access_token;
const fn = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
async function waitFor(runId: string, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [r] = await rows(`select * from task_runs where id='${runId}'`);
    if (r && !['queued', 'running'].includes(r.status)) return r;
    await sleep(500);
  }
  return (await rows(`select * from task_runs where id='${runId}'`))[0];
}

const { data: co } = await F.from('companies').insert({ name: `Petit ${tag}`, description: 'Ceramic dinner sets in blue and white botanical prints', created_by_id: uid }).select().single();
const people = [
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` },
  { name: `Grace ${tag}`, role: 'Customer Advocate' },
  { name: `Marcus ${tag}`, role: 'Finance Director' },
  { name: `Priya ${tag}`, role: 'Product Strategist' },
];
const { data: advs } = await F.from('advisors').insert(people.map((m, i) => ({
  company_id: co.id, created_by_id: uid, type: 'ai',
  default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5',
  fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m,
}))).select();
const by = (n: string) => advs!.find((a: any) => a.name.startsWith(n));
await F.from('documents').insert([
  { company_id: co.id, created_by_id: uid, kind: 'knowledge', category: 'Other', title: 'Price list', content: `Sets are £45. ${LIVE}` },
  { company_id: co.id, created_by_id: uid, kind: 'knowledge', category: 'Other', status: 'archived', title: 'Old notes', content: `Out of date. ${ARCHIVED}` },
  { company_id: co.id, created_by_id: uid, kind: 'document', status: 'archived', title: 'Old deliverable', content: `Invented sources. ${OLD_DELIVERABLE}` },
]);

// ---- 1. Meetings read live documents, never archived ones.
console.log('\n== archived documents stay out of meetings');
await script({ marks: MARKS, fields: {
  priority_actions: [[{ title: 'Draft a message to the parents who showed interest', assigned_to: by('Marcus').name, task_type: 'draft', brief: 'Ask what stopped them buying', done_when: 'Ready to send', why_first: 'Now' }]],
  founder_questions: [[`Do you know the exact material of the dinner set? ${OPEN}`]],
} });
const s = await fn('startBoardMeeting', { company_id: co.id, question: 'How do I validate demand?', advisor_ids: advs!.map((a: any) => a.id) });
await fn('runBoardDiscussion', { meeting_id: s.json?.meeting_id });
await fn('runChairSynthesis', { meeting_id: s.json?.meeting_id });
const meetingLog = await fakeLog();
check(meetingLog.some((l: any) => l.marked.includes(LIVE)), 'the board is given the live document', meetingLog.map((l: any) => l.marked));
check(!meetingLog.some((l: any) => l.marked.includes(ARCHIVED) || l.marked.includes(OLD_DELIVERABLE)), 'and never an archived one');

// ---- 2. A task run: open questions as unknowns, archived Knowledge out, fallback recorded.
console.log('\n== what a task run is told, and the fallback');
const [task] = await rows(`select id from tasks where source_meeting_id='${s.json?.meeting_id}' and task_type='draft'`);
await script({ marks: MARKS, anthropic: Array(6).fill('overload529') });
const r1 = await fn('taskRun', { action: 'start', task_id: task?.id });
const run1 = await waitFor(r1.json?.run?.id, 120_000);
const runLog = await fakeLog();
const answered = runLog.filter((l: any) => l.provider === 'openai' && l.mode === 'ok');
check(run1?.status === 'done', 'the run finishes on the fallback', run1);
check(answered.some((l: any) => l.marked.includes(OPEN)), "the meeting's open question is passed in as an unknown", answered.map((l: any) => l.marked));
check(answered.some((l: any) => l.marked.includes(LIVE)) && !answered.some((l: any) => l.marked.includes(ARCHIVED)), 'live Knowledge goes in, archived Knowledge does not');
check(run1?.result?.written_by?.fallback === true && run1.result.written_by.model === 'gpt-4o', 'the result records that GPT-4o wrote it instead of Sonnet 5.5', run1?.result?.written_by);

// ---- 3. A hand-made Draft/Plan task can be done for the founder.
console.log('\n== a hand-made task');
await script({});
const { data: mine, error: mineErr } = await F.from('tasks').insert({
  company_id: co.id, created_by_id: uid, title: 'Plan the stall weekend', assigned_to: by('Grace').name,
  advisor_id: by('Grace').id, task_type: 'plan', description: 'Two days at the Saturday market', created_by: 'Founder', status: 'todo',
}).select().single();
check(!mineErr && mine?.task_type === 'plan', 'the browser can create a typed task for an advisor', mineErr);
const r2 = await fn('taskRun', { action: 'start', task_id: mine?.id });
const run2 = await waitFor(r2.json?.run?.id);
check(run2?.status === 'done' && run2.result?.written_by?.model === 'claude-sonnet-5-5' && run2.result.written_by.fallback === false, 'and "Do this for me" runs it on Sonnet 5.5, with no fallback shown', run2?.result?.written_by);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
