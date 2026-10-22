// The task board (Workstream T) on a local stack against fake providers ($0):
// departments from the owning advisor (or chosen), short titles waiting and
// written, the existing-task backfill, and who can ask for short titles.
// Setup as in README.md. LOCAL_URL, FAKE_URL and LOCAL_DB_CONTAINER default
// to the shared local stack.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = Deno.env.get('LOCAL_URL') || 'http://127.0.0.1:54321';
const FAKE = Deno.env.get('FAKE_URL') || 'http://127.0.0.1:54399';
const DB = Deno.env.get('LOCAL_DB_CONTAINER') || 'supabase_db_localstack';
const ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };

async function sql(query: string) {
  const p = new Deno.Command('docker', { args: ['exec', '-i', DB, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], stdout: 'piped', stderr: 'piped' });
  const out = await p.output();
  return { ok: out.success, out: new TextDecoder().decode(out.stdout).trim(), err: new TextDecoder().decode(out.stderr).trim() };
}

const signUp = async (who: string) => {
  const email = `${who}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.signInWithPassword({ email, password });
  return { c, uid: data.user!.id, token: data.session!.access_token };
};
const shorten = async (token: string, company_id: string) => {
  const r = await fetch(`${URL}/functions/v1/shortenTaskTitles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify({ company_id }) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const owner = await signUp('tboard');
const { data: co } = await owner.c.from('companies').insert({ name: `petit ${tag}`, created_by_id: owner.uid }).select().single();
const advisor = async (fields: any) => (await owner.c.from('advisors').insert({ company_id: co.id, created_by_id: owner.uid, ...fields }).select().single()).data;
const priya = await advisor({ name: 'Priya Nair', role: 'Marketing Director', library_key: 'marketing_director' });
const rafael = await advisor({ name: 'Rafael Duarte', role: 'Supply Chain Expert', library_key: 'supply_chain' });
const grace = await advisor({ name: 'Grace Bennett', role: 'Customer Advocate', library_key: 'customer_advocate' });
const accountant = await advisor({ name: 'Sam Ellis', role: 'Accountant', type: 'human' });
const accountMgr = await advisor({ name: 'Jo Park', role: 'Account Manager', type: 'human' });
const lawyer = await advisor({ name: 'Ana Lima', role: 'Our lawyer', type: 'human' });
const potter = await advisor({ name: 'Bea Cole', role: 'Potter', type: 'human' });
const journalist = await advisor({ name: 'Cal Reed', role: 'Investigative Journalist', type: 'human' });
const uxDesigner = await advisor({ name: 'Mia Wu', role: 'UX Designer', type: 'human' });
const counsellor = await advisor({ name: 'Kit Shaw', role: 'Careers Counsellor', type: 'human' });
check([priya, rafael, grace, accountant, accountMgr, lawyer, potter, journalist, uxDesigner, counsellor].every((a) => a?.id), 'the board is seated');

const task = async (fields: any, client = owner.c) => client.from('tasks').insert({ company_id: co.id, created_by_id: owner.uid, status: 'todo', ...fields }).select().single();

console.log('== a new task takes its advisor\'s department');
const cases: [string, any, string][] = [
  ['a library marketer', { advisor_id: priya.id, assigned_to: priya.name }, 'marketing'],
  ['the supply chain expert', { advisor_id: rafael.id, assigned_to: rafael.name }, 'ops'],
  ['the customer advocate', { advisor_id: grace.id, assigned_to: grace.name }, 'sales'],
  ['an accountant the founder added', { assigned_to: accountant.name }, 'finance'],
  ['an account manager (not finance)', { assigned_to: accountMgr.name }, 'sales'],
  ['"our lawyer"', { assigned_to: lawyer.name }, 'legal'],
  ['a role with no department words', { assigned_to: potter.name }, 'ops'],
  ['an investigative journalist (not an investor)', { assigned_to: journalist.name }, 'ops'],
  ['a UX designer (product, not marketing)', { assigned_to: uxDesigner.name }, 'product'],
  ['a careers counsellor (not legal)', { assigned_to: counsellor.name }, 'ops'],
  ['the founder', { assigned_to: 'Founder' }, 'ops'],
  ['nobody', {}, 'ops'],
];
for (const [n, [who, fields, want]] of cases.entries()) {
  const { data, error } = await task({ title: `Department case ${n + 1}`, ...fields });
  check(!error && data?.department === want, `${who} → ${want}`, error || data?.department);
}
{
  const { data } = await task({ title: 'Chosen department', advisor_id: priya.id, assigned_to: priya.name, department: 'legal' });
  check(data?.department === 'legal', 'a department chosen when the task is made wins over the advisor\'s', data?.department);
  const { error } = await task({ title: 'Bad department', department: 'hr' });
  check(!!error, 'only the six departments are accepted', error?.message);
  const { data: t } = await task({ title: 'Move me' });
  const { error: moveErr } = await owner.c.from('tasks').update({ department: 'finance' }).eq('id', t.id);
  const { data: moved } = await owner.c.from('tasks').select('department').eq('id', t.id).single();
  check(!moveErr && moved?.department === 'finance', 'the founder can move a task to another department', moveErr || moved);
  await sql(`set session_replication_role = replica; update public.tasks set updated_at = '2026-09-01T10:00:00Z' where id = '${t.id}'`);
  await owner.c.from('tasks').update({ department: 'legal' }).eq('id', t.id);
  const filed = await sql(`select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') from public.tasks where id = '${t.id}'`);
  check(filed.out === '2026-09-01', 'moving a task to another department isn\'t progress: its "last updated" time stays', filed.out);
  await owner.c.from('tasks').update({ updated_at: '2099-01-01T00:00:00Z' }).eq('id', t.id);
  const forged = await sql(`select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') from public.tasks where id = '${t.id}'`);
  check(forged.out === '2026-09-01', 'the browser can\'t set the "last updated" time itself', forged.out);
  await owner.c.from('tasks').update({ status: 'done' }).eq('id', t.id);
  const done = await sql(`select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') from public.tasks where id = '${t.id}'`);
  check(done.out !== '2026-09-01', 'finishing it is: the time moves', done.out);
  const { error: nullErr } = await owner.c.from('tasks').update({ department: null }).eq('id', t.id);
  check(!!nullErr, 'a task can\'t be left without a department', nullErr?.message);
}
{
  // As runChairSynthesis saves an action (service role, advisor id only).
  const { data } = await admin.from('tasks').insert({ company_id: co.id, created_by_id: owner.uid, title: 'From the Chair', advisor_id: grace.id, assigned_to: grace.name, created_by: 'Boardroom', status: 'todo' }).select().single();
  check(data?.department === 'sales', 'the Chair\'s action for an advisor takes that advisor\'s department', data?.department);
}

console.log('\n== short titles wait only for long wording');
const SEVEN = 'Call the Spitalfields organiser about Saturday pitches';
const LONG = 'Ask the two christening-gift shop owners three questions about what sold last quarter';
const { data: short7 } = await task({ title: SEVEN });
const { data: long1 } = await task({ title: LONG, advisor_id: priya.id, assigned_to: priya.name });
const { data: given } = await task({ title: LONG + ' (given)', short_title: 'Ask the gift shop owners' });
check(short7?.short_title_pending === false && short7?.short_title === null, 'seven words or fewer: already short, nothing waits', short7);
check(long1?.short_title_pending === true, 'eight words or more: waits for a short title', long1);
check(given?.short_title_pending === false && given?.short_title === 'Ask the gift shop owners', 'a short title given when the task is made is kept', given);
{
  const { data: t } = await task({ title: LONG + ' again', short_title: 'Ask the shop owners' });
  await owner.c.from('tasks').update({ title: 'Ask the shop owners and the market organiser what sold best this autumn' }).eq('id', t.id);
  const { data: after } = await owner.c.from('tasks').select('short_title, short_title_pending').eq('id', t.id).single();
  check(after?.short_title === null && after?.short_title_pending === true, 'new wording clears the old short title and waits for a new one', after);
  await owner.c.from('tasks').update({ title: 'Ask the shop owners' }).eq('id', t.id);
  const { data: again } = await owner.c.from('tasks').select('short_title, short_title_pending').eq('id', t.id).single();
  check(again?.short_title_pending === false, 'short new wording waits for nothing', again);
}

await task({ title: 'Call the market organiser about a stall for the Christmas fair', advisor_id: grace.id, assigned_to: grace.name });
console.log('\n== the board asks for the short titles');
const { data: waiting } = await owner.c.from('tasks').select('id, title').eq('company_id', co.id).eq('short_title_pending', true);
const [w1, w2] = waiting || [];
check((waiting || []).length === 2, 'two tasks are waiting', waiting);
await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({
  marks: [LONG],
  fields: { titles: [[
    { id: w1.id, short_title: '"Ask the gift shop owners three questions."' },
    { id: w2.id, short_title: 'this answer is much too long to be a short title at all' },
    { id: crypto.randomUUID(), short_title: 'A task nobody asked about' },
  ]] },
}) });
await sql(`set session_replication_role = replica; update public.tasks set updated_at = '2026-09-01T10:00:00Z' where id in ('${w1.id}', '${w2.id}')`);
const before = await sql(`select count(*) from public.user_rate_events where user_id = '${owner.uid}' and action = 'task_short_title'`);
const r = await shorten(owner.token, co.id);
const log = await (await fetch(`${FAKE}/__log`)).json();
check(r.status === 200 && r.json?.titles?.length === 2, 'both waiting tasks are answered', r);
const { data: after } = await owner.c.from('tasks').select('id, short_title, short_title_pending').in('id', [w1.id, w2.id]);
const a1 = after?.find((t: any) => t.id === w1.id), a2 = after?.find((t: any) => t.id === w2.id);
check(a1?.short_title === 'Ask the gift shop owners three questions' && a1?.short_title_pending === false, 'a good short title is saved, without quotes or a full stop', a1);
check(a2?.short_title === null && a2?.short_title_pending === false, 'a bad one is dropped and not asked for again: the card keeps the full wording', a2);
const stamped = await sql(`select string_agg(to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD'), ',') from public.tasks where id in ('${w1.id}', '${w2.id}')`);
check(stamped.out === '2026-09-01,2026-09-01', 'writing a short title isn\'t progress either', stamped.out);
check(log.length === 1 && log[0].marked.includes(LONG), 'one model call, given the tasks\' wording', log.map((l: any) => [l.model, l.marked]));
check(log[0]?.format === 'json_schema' && log[0]?.strict === true, 'the answer shape is enforced by the provider', [log[0]?.format, log[0]?.strict]);
const { data: cheap } = await admin.from('ai_model_configurations').select('model_name').eq('purpose', 'cheap_tier').eq('is_active', true).order('created_at', { ascending: false }).limit(1);
const cheapModel = cheap?.[0]?.model_name || 'gpt-4o-mini';
check(log[0]?.model === cheapModel, `it runs on the cheap tier (${cheapModel})`, log[0]?.model);
const { data: usage } = await admin.from('ai_usage_logs').select('request_type, user_id, status').eq('company_id', co.id).eq('request_type', 'task_short_title');
check(usage?.length === 1 && usage[0].user_id === owner.uid && usage[0].status === 'success', 'the cost is logged against the founder', usage);
const afterCount = await sql(`select count(*) from public.user_rate_events where user_id = '${owner.uid}' and action = 'task_short_title'`);
check(Number(afterCount.out) === Number(before.out) + 1, 'the call counts once against the founder\'s limit', [before.out, afterCount.out]);

{
  await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({}) });
  const r2 = await shorten(owner.token, co.id);
  const log2 = await (await fetch(`${FAKE}/__log`)).json();
  const count2 = await sql(`select count(*) from public.user_rate_events where user_id = '${owner.uid}' and action = 'task_short_title'`);
  check(r2.status === 200 && r2.json?.titles?.length === 0 && log2.length === 0, 'nothing waiting: no model call', [r2, log2.length]);
  check(count2.out === afterCount.out, 'and nothing counted against the limit', [afterCount.out, count2.out]);
}
{
  const { data: t } = await task({ title: LONG + ' when the model is down' });
  await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({ failFor: ['Task title writer'] }) });
  const r3 = await shorten(owner.token, co.id);
  const { data: still } = await owner.c.from('tasks').select('short_title, short_title_pending').eq('id', t.id).single();
  check(r3.status === 500 && still?.short_title_pending === true && still?.short_title === null, 'when the model can\'t answer, the task keeps waiting for the next visit', [r3.status, still]);
  await shorten(owner.token, co.id);
  const r4 = await shorten(owner.token, co.id);
  const { data: gaveUp } = await owner.c.from('tasks').select('short_title, short_title_pending, short_title_attempts').eq('id', t.id).single();
  check(r4.status === 500 && gaveUp?.short_title_pending === false && gaveUp?.short_title_attempts === 3, 'after three failed tries it stops waiting, so a failing batch can\'t keep spending', gaveUp);
  await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({}) });
  const r5 = await shorten(owner.token, co.id);
  const log5 = await (await fetch(`${FAKE}/__log`)).json();
  check(r5.json?.titles?.length === 0 && log5.length === 0, 'and isn\'t asked about again', [r5.json, log5.length]);
  const { data: t2 } = await task({ title: LONG + ' with an unusable answer' });
  await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({ fields: { titles: ['not a list'] } }) });
  const r6 = await shorten(owner.token, co.id);
  const { data: kept } = await owner.c.from('tasks').select('short_title_pending, short_title_attempts').eq('id', t2.id).single();
  check(r6.status === 500 && kept?.short_title_pending === true && kept?.short_title_attempts === 1, 'an answer with no list counts as a failed try, not as "no short title"', [r6.status, kept]);
  await owner.c.from('tasks').update({ title: LONG + ' reworded after a failed try' }).eq('id', t2.id);
  const { data: reworded } = await owner.c.from('tasks').select('short_title_pending, short_title_attempts').eq('id', t2.id).single();
  check(reworded?.short_title_pending === true && reworded?.short_title_attempts === 0, 'new wording starts its tries again', reworded);
  await owner.c.from('tasks').delete().eq('id', t2.id);
  await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({}) });
}

console.log('\n== only the company\'s owner can ask');
{
  const other = await signUp('tboard-other');
  const r4 = await shorten(other.token, co.id);
  check(r4.status === 403 || r4.status === 404, 'another founder is refused', r4);
  const r5 = await fetch(`${URL}/functions/v1/shortenTaskTitles`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ company_id: co.id }) });
  check(r5.status === 401, 'a request without a sign-in is refused', r5.status);
  const { data: anon } = await createClient(URL, ANON, { auth: { persistSession: false } }).auth.signInAnonymously();
  if (anon?.session) {
    const r6 = await shorten(anon.session.access_token, co.id);
    check(r6.status >= 400 && r6.status < 500, 'an anonymous visitor is refused', r6.status);
  } else console.log('SKIP  an anonymous visitor is refused (anonymous sign-in is off on this stack)');
}

console.log('\n== the backfill gives existing tasks a department and leaves their dates alone');
{
  // The migration's backfill, replayed in a transaction on rows made the
  // way they were before it: no department, an old "last updated" time.
  const res = await sql(`
    begin;
    alter table public.tasks disable trigger task_department_and_short_title;
    alter table public.tasks alter column department drop not null;
    insert into public.tasks (company_id, created_by_id, title, assigned_to, advisor_id, status, updated_at) values
      ('${co.id}', '${owner.uid}', 'old by id', '${priya.name}', '${priya.id}', 'done', '2026-09-01T10:00:00Z'),
      ('${co.id}', '${owner.uid}', 'old by name', 'sam ellis ', null, 'done', '2026-09-02T10:00:00Z'),
      ('${co.id}', '${owner.uid}', 'old founder', 'Founder', null, 'todo', '2026-09-03T10:00:00Z');
    update public.tasks t set department = public.task_department_for(t.company_id, t.advisor_id, t.assigned_to) where t.department is null;
    select string_agg(title || '=' || department || '@' || to_char(updated_at at time zone 'UTC', 'MM-DD'), ',' order by title) from public.tasks where company_id = '${co.id}' and title like 'old %';
    rollback;`);
  check(res.ok && res.out.includes('old by id=marketing@09-01') && res.out.includes('old by name=finance@09-02') && res.out.includes('old founder=ops@09-03'),
    'by advisor id, by advisor name, otherwise Ops; dates unchanged', res.out || res.err);
  const left = await sql(`select count(*) from public.tasks where department is null`);
  check(left.out === '0', 'every task has a department', left.out);
}

console.log('\n== the helper functions aren\'t open to the browser');
{
  const { error } = await owner.c.rpc('task_department_for', { p_company: co.id, p_advisor: priya.id, p_assigned_to: null });
  check(!!error, 'the browser can\'t call the department lookup', error?.message);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
Deno.exit(failures ? 1 : 0);
