// The Chair's part of the task board (Workstream T note, owner 15 and 22
// October 2026): she writes each action's short title, and picks the
// department for the founder's own work; an advisor's task takes that
// advisor's home department. Local stack, fake providers ($0).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const email = `tchair-${tag}@example.test`, password = crypto.randomUUID();
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

const { data: co } = await F.from('companies').insert({ name: `tchair ${tag}`, created_by_id: uid, description: 'Dinner sets' }).select().single();
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` },
  { library_key: 'marketing_director', role: 'Marketing Director', name: `Priya ${tag}` },
  { library_key: 'supply_chain', role: 'Supply Chain Expert', name: `Rafael ${tag}` },
  { library_key: 'legal_advisor', role: 'Legal Advisor', name: `Julian ${tag}` },
].map((m) => ({ ...m, company_id: co.id, created_by_id: uid, type: 'ai', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' }))).select();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair');
const priya = advs!.find((a: any) => a.library_key === 'marketing_director');
const act = (title: string, assigned_to: string, task_type: string, short_title: string, department: string) =>
  ({ title, assigned_to, task_type, short_title, department, brief: `brief for ${title}`, done_when: 'done', why_first: 'now' });
await script({ fields: { priority_actions: [[
  act('Ring the market organiser about a stall at the December fair', 'Founder', 'founder', 'Ring the December fair organiser', 'sales'),
  act('Draft the launch post for the gift-buyer group on the local forum', priya.name, 'draft', 'Draft the gift-buyer launch post', 'finance'),
  act('Write down the most each set could cost you at forty-five and sixty-five pounds', 'Founder', 'founder', 'Write the maximum cost per set at each of the two prices today please', 'finance'),
]] } });
const id = crypto.randomUUID();
await call('startBoardMeeting', { company_id: co.id, question: 'Should we take a stall at the December fair?', advisor_ids: debaters.map((a: any) => a.id), meeting_id: id, server_driven: true });
let m: any;
for (let i = 0; i < 300; i++) { m = await row(id); if (m && ['complete', 'failed'].includes(m.status)) break; await sleep(400); }
check(m?.status === 'complete', 'the meeting completes', m?.status);
const { data: tasks } = await admin.from('tasks').select('title, short_title, short_title_pending, department, advisor_id').eq('source_meeting_id', id).order('created_at');
const by = (start: string) => (tasks || []).find((t: any) => t.title.startsWith(start));
const ring = by('Ring the market'), post = by('Draft the launch'), cost = by('Write down');
check(ring?.short_title === 'Ring the December fair organiser' && ring?.short_title_pending === false && ring?.department === 'sales',
  "the founder's own action: her short title, and the department she chose", ring);
check(post?.short_title === 'Draft the gift-buyer launch post' && post?.advisor_id === priya.id && post?.department === 'marketing',
  "an advisor's action: her short title, and the advisor's home department (not hers)", post);
check(cost?.short_title === null && cost?.short_title_pending === true && cost?.department === 'finance',
  'a short title over seven words is dropped, and the board asks for one later', cost);
check((m?.board_resolution?.priority_actions || []).every((a: any) => 'short_title' in a && 'department' in a), 'the saved resolution keeps both on each action');

await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);
await admin.from('advisors').delete().eq('company_id', co.id);
await admin.from('companies').delete().eq('id', co.id);
await admin.auth.admin.deleteUser(uid);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
