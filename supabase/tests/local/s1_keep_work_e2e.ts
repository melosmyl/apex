// Workstream S (Teams), S1: people's work stays with the company, on the
// local stack ($0, no model calls). Setup as in README.md; LOCAL_URL and
// LOCAL_DB_CONTAINER override the defaults.
//   LOCAL_ANON_KEY=… LOCAL_SERVICE_KEY=… deno run -A supabase/tests/local/s1_keep_work_e2e.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = Deno.env.get('LOCAL_URL') || 'http://127.0.0.1:54321';
const ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const DB = Deno.env.get('LOCAL_DB_CONTAINER') || 'supabase_db_localstack';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const created: string[] = [];
const sql = async (q: string) => {
  const out = await new Deno.Command('docker', { args: ['exec', '-i', DB, 'psql', '-U', 'postgres', '-Atqc', q] }).output();
  return new TextDecoder().decode(out.stdout).trim();
};
async function person(name: string, display?: string) {
  const email = `s1-${name}-${tag}@example.test`, password = crypto.randomUUID();
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: display ? { full_name: display } : {} });
  created.push(data.user!.id);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user!.id, client };
}
const CONTENT = ['advisors', 'projects', 'board_meetings', 'voice_meeting_sessions', 'decisions', 'tasks', 'documents',
  'pins', 'notes', 'progression_trees', 'progression_nodes', 'progression_node_completions', 'task_runs'];

// One row in every content table, in company `co`, made by `by` (written
// with the service role, as the server does, so a row can be made by someone
// other than the company's founder, as members will).
async function fill(co: string, by: string) {
  const ins = async (table: string, row: any) => {
    const { data, error } = await admin.from(table).insert({ company_id: co, created_by_id: by, ...row }).select('id').single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data.id;
  };
  const adv = await ins('advisors', { name: `Adv ${tag}`, role: 'Finance Director', type: 'ai' });
  await ins('projects', { name: `Project ${tag}` });
  const meeting = await ins('board_meetings', { question: `Q ${tag}`, status: 'complete' });
  await ins('voice_meeting_sessions', { meeting_id: meeting, meeting_topic: 'topic' });
  await ins('decisions', { question: `Decision ${tag}` });
  const task = await ins('tasks', { title: `Task ${tag}` });
  await ins('documents', { title: `Doc ${tag}` });
  await ins('pins', { source_type: 'task', selected_text: `Pin ${tag}` });
  await ins('notes', { raw_text: `Note ${tag}` });
  const tree = await ins('progression_trees', { spine_version: 'v1' });
  const node = await ins('progression_nodes', { tree_id: tree, source: 'spine', order_index: 1, label: `Node ${tag}`, unlock_description: 'x', derivation_type: 'db_fact' });
  await ins('progression_node_completions', { node_id: node, completion_source: 'db_fact' });
  await ins('task_runs', { task_id: task, advisor_id: adv, task_type: 'research' });
  return { meeting, task };
}
const counts = async (co: string, by: string) => {
  const out: Record<string, number> = {};
  for (const t of CONTENT) out[t] = (await admin.from(t).select('id', { count: 'exact', head: true }).eq('company_id', co).eq('created_by_id', by)).count ?? -1;
  return out;
};

try {
  // Before Teams: deleting a founder deletes their company and all of it, as today
  const solo = await person('solo', 'Solo Founder');
  const { data: soloCo } = await solo.client.from('companies').insert({ name: `Solo ${tag}`, created_by_id: solo.id }).select().single();
  await fill(soloCo.id, solo.id);
  await admin.auth.admin.deleteUser(solo.id);
  const soloLeft = await counts(soloCo.id, solo.id);
  check((await admin.from('companies').select('id').eq('id', soloCo.id)).data?.length === 0 && Object.values(soloLeft).every((n) => n === 0),
    "deleting a founder still deletes their company and everything in it", soloLeft);
  check(await sql(`select count(*) from public.former_members where user_id = '${solo.id}'`) === '0', "…and keeps no record of their name");

  // With Teams: someone's work in another person's company stays when they go
  const owner = await person('owner', 'Olive Owner');
  const helper = await person('helper', 'Hal Helper');
  const { data: co } = await owner.client.from('companies').insert({ name: `Shared ${tag}`, created_by_id: owner.id }).select().single();
  await fill(co.id, helper.id);
  await admin.from('assistant_events').insert({ user_id: helper.id, company_id: co.id, event_type: 'note_captured' });
  const before = await counts(co.id, helper.id);
  await admin.auth.admin.deleteUser(helper.id);
  const after = await counts(co.id, helper.id);
  check(Object.values(before).every((n) => n === 1) && JSON.stringify(before) === JSON.stringify(after),
    "a person's work in someone else's company stays, still marked as theirs, when their account is deleted", { before, after });
  check((await admin.from('companies').select('id').eq('id', co.id)).data?.length === 1, '…and the company is untouched');
  check(await sql(`select display_name from public.former_members where user_id = '${helper.id}'`) === 'Hal Helper', '…and their name is kept for "made by"');
  check(((await admin.from('assistant_events').select('id').eq('user_id', helper.id)).data ?? []).length === 0, 'their personal records (assistant events) still go with them');
  const fm = await owner.client.from('former_members').select('*');
  check(!!fm.error || (fm.data ?? []).length === 0, "nobody can read the kept names directly (only through the member list, later)");

  // Old voice-meeting messages are personal: they go with the person, even with no company
  const talker = await person('talker');
  const { data: msg } = await talker.client.from('meeting_messages').insert({ created_by_id: talker.id, session_id: crypto.randomUUID(), speaker_type: 'founder', message_text: 'orphan' }).select('id').single();
  await admin.auth.admin.deleteUser(talker.id);
  check(!!msg && ((await admin.from('meeting_messages').select('id').eq('id', msg.id)).data ?? []).length === 0, 'old voice-meeting messages still go with the person (they can belong to no company)');

  // Someone who only made a call is remembered too; names go once nothing of theirs is left
  const caller = await person('caller', 'Cal Caller');
  const { data: callMtg } = await admin.from('board_meetings').insert({ company_id: co.id, created_by_id: owner.id, question: `Theirs ${tag}`, founder_decision: 'accept', decided_by: caller.id }).select('id, decided_by').single();
  check(callMtg?.decided_by === caller.id, 'the server can say who made the call');
  await admin.auth.admin.deleteUser(caller.id);
  check(await sql(`select display_name from public.former_members where user_id = '${caller.id}'`) === 'Cal Caller', "someone who only made a call is remembered by name");
  await admin.from('companies').delete().eq('id', co.id);
  check(await sql(`select count(*) from public.former_members where user_id in ('${caller.id}', '${helper.id}')`) === '0', "…and the names go once the company holding their work is deleted");
  const { data: co2 } = await owner.client.from('companies').insert({ name: `Shared again ${tag}`, created_by_id: owner.id }).select().single();

  // Anonymous free-meeting visitors: unchanged, nothing kept
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: a } = await anon.auth.signInAnonymously();
  created.push(a!.user!.id);
  const { data: anonCo } = await anon.from('companies').insert({ name: `Free ${tag}`, created_by_id: a!.user!.id }).select().single();
  await admin.from('board_meetings').insert({ company_id: anonCo.id, created_by_id: a!.user!.id, question: 'free', status: 'complete' });
  await admin.auth.admin.deleteUser(a!.user!.id);
  check((await admin.from('board_meetings').select('id').eq('company_id', anonCo.id)).data?.length === 0
    && await sql(`select count(*) from public.former_members where user_id = '${a!.user!.id}'`) === '0',
    'an anonymous visitor deleted: their company and meeting go, and nothing is kept');

  // Who made a row can't be changed, by anyone
  const { data: pin } = await owner.client.from('pins').insert({ company_id: co2.id, created_by_id: owner.id, source_type: 'task', selected_text: `Mine ${tag}` }).select().single();
  await owner.client.from('pins').update({ created_by_id: crypto.randomUUID(), selected_text: 'renamed' }).eq('id', pin.id);
  await admin.from('pins').update({ created_by_id: crypto.randomUUID() }).eq('id', pin.id);
  const { data: pinNow } = await admin.from('pins').select('created_by_id, selected_text').eq('id', pin.id).single();
  check(pinNow?.created_by_id === owner.id && pinNow?.selected_text === 'renamed', "who made a row stays as it was (other edits still work)", pinNow);
  const fake = await owner.client.from('pins').insert({ company_id: co2.id, created_by_id: crypto.randomUUID(), source_type: 'task', selected_text: 'forged' }).select();
  check(!!fake.error, "nobody can add a row in someone else's name", fake.error);

  // Who made the call on a meeting
  const { data: mtg } = await owner.client.from('board_meetings').insert({ company_id: co2.id, created_by_id: owner.id, question: `Call ${tag}` }).select().single();
  check(mtg && mtg.decided_by === null, 'a new meeting has no decider');
  let r = await owner.client.from('board_meetings').update({ founder_decision: 'accept' }).eq('id', mtg.id).select('decided_by').single();
  check(r.data?.decided_by === owner.id, 'making the call records who made it', r);
  r = await owner.client.from('board_meetings').update({ founder_decision_notes: 'thinking more' }).eq('id', mtg.id).select('decided_by').single();
  check(r.data?.decided_by === owner.id, "editing the notes doesn't change who decided", r);
  const direct = await owner.client.from('board_meetings').update({ decided_by: crypto.randomUUID() } as any).eq('id', mtg.id).select();
  check(!!direct.error && (await admin.from('board_meetings').select('decided_by').eq('id', mtg.id).single()).data?.decided_by === owner.id,
    "the browser can't set who decided", direct.error);
  await admin.from('board_meetings').update({ founder_decision_notes: 'server note' }).eq('id', mtg.id);
  check((await admin.from('board_meetings').select('decided_by').eq('id', mtg.id).single()).data?.decided_by === owner.id,
    "the server's other updates leave the decider as it was", null);
  r = await owner.client.from('board_meetings').update({ founder_decision: 'undecided' }).eq('id', mtg.id).select('decided_by').single();
  check(r.data?.decided_by === null, 'taking the call back ("undecided", as the screen saves it) clears it', r);
  await owner.client.from('board_meetings').update({ founder_decision: 'accept' }).eq('id', mtg.id);
  r = await owner.client.from('board_meetings').update({ founder_decision: null }).eq('id', mtg.id).select('decided_by').single();
  check(r.data?.decided_by === null, '…and so does clearing it', r);

  // Who approved a document
  const { data: doc } = await owner.client.from('documents').insert({ company_id: co2.id, created_by_id: owner.id, title: `Approve ${tag}`, approval_status: 'approved', approved_by_user_id: crypto.randomUUID() } as any).select('id, approved_by_user_id').single();
  check(doc?.approved_by_user_id === owner.id, 'a document added as approved records the real approver, whatever was sent', doc);
  await owner.client.from('documents').update({ approved_by_user_id: crypto.randomUUID(), title: 'retitled' } as any).eq('id', doc.id);
  check((await admin.from('documents').select('approved_by_user_id').eq('id', doc.id).single()).data?.approved_by_user_id === owner.id, "…and it can't be changed without approving again");
  await owner.client.from('documents').update({ approval_status: 'revision_requested' }).eq('id', doc.id);
  check((await admin.from('documents').select('approved_by_user_id').eq('id', doc.id).single()).data?.approved_by_user_id === null, 'asking for a revision clears it');
  const { data: srv } = await admin.from('documents').insert({ company_id: co2.id, created_by_id: owner.id, title: `Accepted ${tag}`, approval_status: 'approved', approved_by_user_id: owner.id } as any).select('approved_by_user_id').single();
  check(srv?.approved_by_user_id === owner.id, 'the server can say who approved (accepting a "Do this for me" result)', srv);

  // Every remaining link to an account is a personal one
  const links = await sql(`select string_agg(conrelid::regclass::text, ',' order by conrelid::regclass::text) from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass and connamespace = 'public'::regnamespace`);
  check(links === 'assistant_chases,assistant_events,company_members,document_download_logs,free_meeting_attempts,meeting_messages,profiles,subscriptions',
    'accounts are linked only to profiles, memberships and personal records (no company content)', links);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  await sql(`delete from public.former_members where user_id in (${created.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'"})`);
  await sql(`delete from public.companies where name like '%${tag}'`);
}

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
