// Workstream M1, end to end on the local stack against fake providers ($0):
// the Chair's results in the principles' order, owners resolved to real
// advisors, the vague-action repair, typed tasks, the founder's call and
// answers, and the share page. Setup as in README.md.
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

async function founder(label: string) {
  const email = `${label}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await client.auth.signInWithPassword({ email, password });
  const token = data.session!.access_token;
  const fn = async (name: string, body: unknown) => {
    const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { client, uid: data.user!.id, fn };
}

async function board(F: any, uid: string, label: string) {
  const { data: co } = await F.from('companies').insert({ name: `${label} ${tag}`, created_by_id: uid }).select().single();
  const members = [
    { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` },
    { name: `Grace ${tag}`, role: 'Customer Advocate' },
    { name: `Marcus ${tag}`, role: 'Finance Director' },
    { name: `Priya ${tag}`, role: 'Product Strategist' },
  ];
  const { data: advs } = await F.from('advisors').insert(members.map((m, i) => ({
    company_id: co.id, created_by_id: uid, type: 'ai',
    default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5',
    fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m,
  }))).select();
  return { co, advs: advs!, by: (n: string) => advs!.find((a: any) => a.name.startsWith(n)) };
}

async function meeting(fn: any, B: any, question: string) {
  const s = await fn('startBoardMeeting', { company_id: B.co.id, question, advisor_ids: B.advs.map((a: any) => a.id) });
  await fn('runBoardDiscussion', { meeting_id: s.json?.meeting_id });
  const r = await fn('runChairSynthesis', { meeting_id: s.json?.meeting_id });
  return { id: s.json?.meeting_id, r };
}

const action = (title: string, assigned_to: string, task_type: string) => ({ title, assigned_to, task_type, brief: `brief for ${title}`, done_when: `done: ${title}`, why_first: 'it cannot wait' });

const A = await founder('m1');
const B = await board(A.client, A.uid, 'm1');
const grace = B.by('Grace'), marcus = B.by('Marcus');

// ---- 1. The results, capped, with owners resolved and one vague action repaired.
console.log('\n== results, owners and the repair');
await script({ fields: {
  verdict: ['Go ahead, but sell ten before you buy stock.'],
  priority_actions: [
    [
      action('Validate demand', grace.name, 'research'),
      action('Ring your landlord about the break clause', 'Founder', 'draft'),
      action('Work out the margin on a £45 coat', 'the finance director', 'calculate'),
      action('A fourth action', 'Founder', 'plan'),
    ],
  ],
  // The repair's answer: just the flagged action, by number, plus one it
  // wasn't asked about, which must be ignored.
  actions: [[
    { number: 1, title: 'Ask the 40 people on your waitlist to pre-pay £10', brief: 'new brief', done_when: '' },
    { number: 3, title: 'Should not replace action 3', brief: 'x', done_when: 'x' },
  ]],
  top_issues: [
    Array.from({ length: 7 }, (_, i) => ({ problem: `problem ${i}`, why_it_matters: 'it matters', fix: `Call supplier ${i} about MOQ` })),
  ],
  founder_questions: [['Will you hold stock?', 'Will you sell abroad?', 'q3?', 'q4?', 'q5?']],
  disagreements: [['Grace and Marcus on price', 'Priya and Marcus on timing', 'a third', 'a fourth']],
} });
const m1 = await meeting(A.fn, B, 'Should I start reselling vintage coats?');
const res = m1.r.json?.board_resolution || {};
check(m1.r.status === 200 && res.verdict === 'Go ahead, but sell ten before you buy stock.', 'the verdict is stored', m1.r.json);
check(res.priority_actions?.length === 3, 'at most 3 actions', res.priority_actions?.length);
check(res.top_issues?.length === 5 && res.founder_questions?.length === 4 && res.disagreements?.length === 3, 'issues 5, questions 4, disagreements 3');
const usage1 = await rows(`select request_type from ai_usage_logs where meeting_id='${m1.id}'`);
check(usage1.filter((u: any) => u.request_type === 'chair_repair').length === 1, 'a vague action sends the Chair back exactly once', usage1);
const [a0, a1, a2] = res.priority_actions || [];
check(a0?.title === 'Ask the 40 people on your waitlist to pre-pay £10', 'the vague action is reworded', a0);
check(a0?.advisor_id === grace.id && a0?.task_type === 'research', 'the repair rewords it but keeps its owner and type', a0);
check(a1?.assigned_to === 'Founder' && a1?.task_type === null && a1?.advisor_id === null, "the founder's own action has no task type", a1);
check(a2?.advisor_id === marcus.id && a2?.assigned_to === marcus.name, '"the finance director" resolves to the Finance Director, not the Chair', a2);
check(a2?.title === 'Work out the margin on a £45 coat', 'an action the repair was not asked about is untouched', a2);

const tasks = await rows(`select title, task_type, advisor_id, description, done_when, assigned_to from tasks where source_meeting_id='${m1.id}' order by created_at, title`);
const t0 = tasks.find((t: any) => t.title.startsWith('Ask the 40'));
check(tasks.length === 3, 'three tasks are created', tasks);
check(t0?.task_type === 'research' && t0?.advisor_id === grace.id && t0?.description === 'new brief' && t0?.done_when === 'done: Validate demand', 'a task carries its type, owner, brief and done-when', t0);
check(tasks.some((t: any) => t.assigned_to === 'Founder' && t.task_type === null && t.advisor_id === null), "the founder's task has no type or advisor");

// ---- 2. A concrete meeting goes straight through: no repair call.
console.log('\n== no repair when nothing is vague');
await script({ fields: { priority_actions: [[action('Email Sarah the revised quote', grace.name, 'draft')]] } });
const m2 = await meeting(A.fn, B, 'Should I send the quote?');
const usage2 = await rows(`select request_type from ai_usage_logs where meeting_id='${m2.id}'`);
check(m2.r.status === 200 && !usage2.some((u: any) => u.request_type === 'chair_repair'), 'no repair call', usage2);

// ---- 3. The founder's call and answers save from the browser, within limits.
console.log("\n== the founder's call and answers");
const up = (patch: unknown) => A.client.from('board_meetings').update(patch).eq('id', m1.id).select('founder_decision, founder_answers').single();
const c1 = await up({ founder_decision: 'modify', founder_decision_notes: 'Only five coats' });
check(!c1.error && c1.data?.founder_decision === 'modify', 'the call saves', c1.error);
const c2 = await up({ founder_answers: { 0: 'yes', 1: 'not_sure' } });
check(!c2.error && c2.data?.founder_answers?.['1'] === 'not_sure', 'the answers save', c2.error);
const c3 = await up({ founder_answers: ['yes'] });
check(!!c3.error, 'answers must be an object', c3.data);
const c4 = await up({ founder_answers: { 0: 'x'.repeat(3000) } });
check(!!c4.error, 'answers are size-limited', c4.data);
const c5 = await A.client.from('board_meetings').update({ board_resolution: { verdict: 'forged' } }).eq('id', m1.id).select('id');
check(!!c5.error || !c5.data?.length, 'the founder still cannot rewrite the resolution', c5.data);

// ---- 4. A task's advisor must sit on the same company's board.
console.log("\n== task advisors stay on their own board");
const Other = await founder('m1other');
const OB = await board(Other.client, Other.uid, 'other');
const [task] = await rows(`select id from tasks where source_meeting_id='${m1.id}' limit 1`);
const t1 = await A.client.from('tasks').update({ advisor_id: OB.advs[1].id }).eq('id', task.id).select('id');
check(!!t1.error, "a task can't be pointed at another company's advisor", t1.data);
const t2 = await A.client.from('tasks').update({ advisor_id: marcus.id }).eq('id', task.id).select('advisor_id').single();
check(!t2.error && t2.data?.advisor_id === marcus.id, 'it can move to another advisor on the same board', t2.error);

// ---- 5. The share page: the results in order, without the founder's call or answers.
console.log('\n== the share page');
const shareToken = crypto.randomUUID();
await A.client.from('board_meetings').update({ share_token: shareToken }).eq('id', m1.id);
const sr = await fetch(`${URL}/functions/v1/getSharedMeeting?token=${shareToken}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
const shared = await sr.json();
check(sr.status === 200 && shared.verdict === res.verdict, 'the verdict is shared', shared);
check(shared.priority_actions?.length === 3 && shared.priority_actions.every((a: any) => !('brief' in a) && !('advisor_id' in a)), 'actions are shared without briefs or ids', shared.priority_actions);
check(shared.founder_questions?.length === 4 && shared.top_issues?.length === 5 && shared.disagreements?.length === 3, 'questions, issues and disagreements are shared');
const leaked = JSON.stringify(shared);
check(!leaked.includes('not_sure') && !leaked.includes('Only five coats') && !('founder_decision' in shared) && !('founder_answers' in shared), "the founder's call and answers are not shared");

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
