// Workstream M2a, end to end on the local stack against fake providers ($0):
// "Do this for me" for Draft and Plan tasks: runs in the background on the
// owner's model, cost tagged to the run, Accept / Redo / Discard, the daily
// limit, ownership, and the sweep that restarts stalled runs. Setup as in
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
const inserted = async (q: string) => JSON.parse(await sql(`with i as (${q}) select coalesce(json_agg(i), '[]') from i`));
const script = (s: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(s) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function founder(label: string) {
  const email = `${label}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const token = data.session!.access_token;
  const fn = async (name: string, body: unknown, bearer = token) => {
    const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, apikey: ANON }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { client, uid: data.user!.id, fn };
}

const A = await founder('m2a');
const { data: co } = await A.client.from('companies').insert({ name: `M2a ${tag}`, created_by_id: A.uid }).select().single();
const people = [
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` },
  { name: `Grace ${tag}`, role: 'Customer Advocate' },
  { name: `Marcus ${tag}`, role: 'Finance Director' },
  { name: `Priya ${tag}`, role: 'Product Strategist' },
];
const { data: advs } = await A.client.from('advisors').insert(people.map((m, i) => ({
  company_id: co.id, created_by_id: A.uid, type: 'ai',
  default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5',
  fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m,
}))).select();
const by = (n: string) => advs!.find((a: any) => a.name.startsWith(n));
await A.client.from('notes').insert({ company_id: co.id, created_by_id: A.uid, raw_text: 'Called the shop on Monday, they said bring stock in on Thursdays.' });

const action = (title: string, assigned_to: string, task_type: string) => ({ title, assigned_to, task_type, brief: `brief: ${title}`, done_when: 'done', why_first: 'now' });
await script({ fields: { priority_actions: [[
  action('Draft a message to the two charity shops about coat stock', by('Grace').name, 'draft'),
  action('Plan the first week, including the lease question for the stall', by('Marcus').name, 'plan'),
  action('Research three coat suppliers', by('Priya').name, 'research'),
]] } });
const s = await A.fn('startBoardMeeting', { company_id: co.id, question: 'Should I sell coats?', advisor_ids: advs!.map((a: any) => a.id) });
await A.fn('runBoardDiscussion', { meeting_id: s.json?.meeting_id });
await A.fn('runChairSynthesis', { meeting_id: s.json?.meeting_id });
const tasks = await rows(`select id, title, task_type, advisor_id, status from tasks where source_meeting_id='${s.json?.meeting_id}' order by created_at`);
const draftTask = tasks.find((t: any) => t.task_type === 'draft');
const planTask = tasks.find((t: any) => t.task_type === 'plan');
const researchTask = tasks.find((t: any) => t.task_type === 'research');
check(!!draftTask && !!planTask && !!researchTask, 'the meeting created a draft, a plan and a research task', tasks);

async function waitFor(runId: string, until = (r: any) => !['queued', 'running'].includes(r.status), ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const [r] = await rows(`select * from task_runs where id='${runId}'`);
    if (r && until(r)) return r;
    await sleep(500);
  }
  return (await rows(`select * from task_runs where id='${runId}'`))[0];
}

// ---- 1. A draft runs in the background and comes back to the desk.
console.log('\n== draft');
await script({ fields: { body: ['Hello, I run a small coat resale business. [your name]'], placeholders: [['[your name]']] } });
const d1 = await A.fn('taskRun', { action: 'start', task_id: draftTask.id });
check(d1.status === 200 && ['queued', 'running'].includes(d1.json?.run?.status), 'starting answers at once, before the work is done', d1.json);
const again = await A.fn('taskRun', { action: 'start', task_id: draftTask.id });
check(again.status === 409, 'a second start while it runs is refused', again.json);
const [inProgress] = await rows(`select status from tasks where id='${draftTask.id}'`);
check(inProgress.status === 'in_progress', 'the task moves to In Progress');
const r1 = await waitFor(d1.json?.run?.id);
check(r1?.status === 'done' && r1.result?.body?.startsWith('Hello, I run'), 'the advisor finishes it in the background', r1);
check(Number(r1?.cost_usd) > 0, 'the run carries its cost', r1?.cost_usd);
const logs = await rows(`select request_type, model from ai_usage_logs where task_run_id='${r1?.id}'`);
check(logs.length >= 1 && logs[0].request_type === 'task_draft' && logs[0].model === 'claude-sonnet-5-5', 'it ran on Sonnet 5.5, logged against the run', logs);
const [review] = await rows(`select status from tasks where id='${draftTask.id}'`);
check(review.status === 'review', 'the task moves to Review');
check(r1?.result?.professional_note === '', 'an ordinary message carries no lawyer line');

// ---- 2. Redo with notes keeps the earlier attempt; accept saves to Knowledge.
console.log('\n== redo and accept');
const redo = await A.fn('taskRun', { action: 'start', task_id: draftTask.id, notes: 'Make it shorter and friendlier' });
check(redo.status === 200 && redo.json?.run?.previous_run_id === r1?.id, 'a redo builds on the earlier attempt', redo.json);
const [earlier] = await rows(`select status from task_runs where id='${r1?.id}'`);
check(earlier.status === 'discarded', 'the earlier attempt is kept, set aside', earlier);
const r2 = await waitFor(redo.json?.run?.id);
check(r2?.status === 'done' && r2.redo_notes === 'Make it shorter and friendlier', 'the redo finishes with its notes recorded', r2);
await sql(`update tasks set deliverable = 'Old generator summary', blocker = 'old note' where id='${draftTask.id}'`);
const acc = await A.fn('taskRun', { action: 'accept', run_id: r2?.id });
check(acc.status === 200 && !!acc.json?.document_id, 'accept answers with the saved document', acc.json);
const [doc] = await rows(`select kind, task_id, created_by_advisor_id, approval_status, content from documents where id='${acc.json?.document_id}'`);
check(doc?.kind === 'knowledge' && doc.task_id === draftTask.id && doc.created_by_advisor_id === by('Grace').id && doc.approval_status === 'approved', 'it is saved to Knowledge, linked to the task and the advisor', doc);
const [doneTask] = await rows(`select status, document_id from tasks where id='${draftTask.id}'`);
check(doneTask.status === 'done' && doneTask.document_id === acc.json?.document_id, 'the task is done and points at the document');
const [cleared] = await rows(`select deliverable, blocker, delegated_back from tasks where id='${draftTask.id}'`);
check(cleared.deliverable === null && cleared.blocker === null && cleared.delegated_back === false, "an old generator's summary is cleared on Accept", cleared);
const acc2 = await A.fn('taskRun', { action: 'accept', run_id: r2?.id });
check(acc2.status === 409, 'accepting twice saves one document', acc2.json);
const afterDone = await A.fn('taskRun', { action: 'start', task_id: draftTask.id });
check(afterDone.status === 409, 'a done task is not started again', afterDone.json);
// Moved back to To Do, it can be done again; the new accepted version
// replaces the old one in Knowledge.
await A.client.from('tasks').update({ status: 'todo' }).eq('id', draftTask.id);
const again2 = await A.fn('taskRun', { action: 'start', task_id: draftTask.id });
check(again2.status === 200, 'a task moved back to To Do can be done again', again2.json);
const r3 = await waitFor(again2.json?.run?.id);
const acc3 = await A.fn('taskRun', { action: 'accept', run_id: r3?.id });
const docs3 = await rows(`select id, status from documents where task_id='${draftTask.id}' and kind='knowledge' order by created_at`);
const [task3] = await rows(`select status, document_id from tasks where id='${draftTask.id}'`);
check(acc3.status === 200 && docs3.length === 2 && docs3[0].status === 'superseded' && docs3[1].id === acc3.json?.document_id && docs3[1].status !== 'superseded',
  'accepting the new version replaces the old one in Knowledge', docs3);
check(task3.status === 'done' && task3.document_id === acc3.json?.document_id, 'and the task points at the new one', task3);

// ---- 3. A plan: dated steps, and the lawyer line when a lease is involved.
console.log('\n== plan and discard');
await script({ fields: { steps: [[{ date: '2026-10-15', step: 'Ring the stall landlord about the lease', detail: '' }, { date: 'soon', step: 'Price the coats', detail: '' }]] } });
const p1 = await A.fn('taskRun', { action: 'start', task_id: planTask.id });
const rp = await waitFor(p1.json?.run?.id);
check(rp?.status === 'done' && rp.result?.steps?.[0]?.date === '2026-10-15' && rp.result?.steps?.[1]?.date === '', 'a plan keeps real dates only', rp?.result);
check(rp?.result?.professional_note?.includes('lawyer or accountant'), 'a lease brings the lawyer-or-accountant line', rp?.result?.professional_note);
const disc = await A.fn('taskRun', { action: 'discard', run_id: rp?.id });
const [openTask] = await rows(`select status from tasks where id='${planTask.id}'`);
check(disc.status === 200 && openTask.status === 'todo', 'discard leaves the task open');

// ---- 4. What can't be run, and who can't run it.
console.log('\n== refusals');
const res = await A.fn('taskRun', { action: 'start', task_id: researchTask.id });
check(res.status === 400, 'research waits for web search (Stage 3)', res.json);
const B = await founder('m2aother');
const steal = await B.fn('taskRun', { action: 'start', task_id: planTask.id });
check(steal.status === 403 || steal.status === 404, "another founder can't run my task", steal);
const stealAccept = await B.fn('taskRun', { action: 'accept', run_id: rp?.id });
check(stealAccept.status === 403 || stealAccept.status === 404, "another founder can't decide my result", stealAccept);
const write = await A.client.from('task_runs').update({ status: 'accepted' }).eq('id', rp?.id).select('id');
check(!!write.error || !write.data?.length, "the browser can't write runs", write.data);
const sweepAsFounder = await A.fn('taskRun', { action: 'sweep' });
check(sweepAsFounder.status === 401, 'only the cron job can sweep', sweepAsFounder.json);

// ---- 5. A failed run says so plainly and leaves the task open.
console.log('\n== failure');
await script({ anthropic: Array(8).fill('overload529'), openai: Array(8).fill('overload529') });
const f1 = await A.fn('taskRun', { action: 'start', task_id: planTask.id });
const rf = await waitFor(f1.json?.run?.id, undefined, 120_000);
const [afterFail] = await rows(`select status from tasks where id='${planTask.id}'`);
check(rf?.status === 'failed' && /couldn't finish this just now/.test(rf.error || '') && afterFail.status === 'todo', 'a failed run is plain about it and the task stays open', rf);
await script({});

// ---- 6. The sweep starts a run nobody picked up, and gives up after three tries.
console.log('\n== sweep');
const [stuck] = await inserted(`insert into task_runs (task_id, company_id, created_by_id, advisor_id, advisor_name, task_type, status, created_at)
  values ('${planTask.id}', '${co.id}', '${A.uid}', '${by('Marcus').id}', 'Marcus', 'plan', 'queued', now() - interval '2 minutes') returning id`);
const sw = await A.fn('taskRun', { action: 'sweep' }, SERVICE);
check(sw.status === 200 && sw.json?.restarted >= 1, 'the sweep picks it up', sw.json);
const rs = await waitFor(stuck.id);
check(rs?.status === 'done' && rs.attempts === 1, 'and the run finishes', rs);
await A.fn('taskRun', { action: 'discard', run_id: stuck.id });
const [dead] = await inserted(`insert into task_runs (task_id, company_id, created_by_id, advisor_id, advisor_name, task_type, status, attempts, claimed_at)
  values ('${planTask.id}', '${co.id}', '${A.uid}', '${by('Marcus').id}', 'Marcus', 'plan', 'running', 3, now() - interval '10 minutes') returning id`);
await A.fn('taskRun', { action: 'sweep' }, SERVICE);
const [gaveUp] = await rows(`select status, error from task_runs where id='${dead.id}'`);
check(gaveUp.status === 'failed' && /stalled/.test(gaveUp.error), 'a run that stalled three times is marked failed, plainly', gaveUp);

// ---- 7. The daily limit: 15 runs.
console.log('\n== daily limit');
await sql(`insert into user_rate_events (user_id, action) select '${A.uid}', 'task_run' from generate_series(1, 15)`);
const over = await A.fn('taskRun', { action: 'start', task_id: planTask.id });
check(over.status === 429, 'the 16th run of the day is refused', over.json);

// ---- 8. A task the founder finishes mid-run stays finished.
console.log('\n== founder finishes it first');
await sql(`delete from user_rate_events where user_id='${A.uid}'`);
const [fresh] = await inserted(`insert into tasks (company_id, created_by_id, title, assigned_to, advisor_id, task_type, status, source_meeting_id)
  values ('${co.id}', '${A.uid}', 'Plan the stall weekend', 'Marcus', '${by('Marcus').id}', 'plan', 'todo', '${s.json?.meeting_id}') returning id`);
await script({ delayBy: { [by('Marcus').name]: 4000 } });
const mid = await A.fn('taskRun', { action: 'start', task_id: fresh.id });
await A.client.from('tasks').update({ status: 'done' }).eq('id', fresh.id);
const rm = await waitFor(mid.json?.run?.id);
const [stillDone] = await rows(`select status from tasks where id='${fresh.id}'`);
check(rm?.status === 'done' && stillDone.status === 'done', 'the finished run does not reopen it', { run: rm?.status, task: stillDone.status });
await script({});

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
