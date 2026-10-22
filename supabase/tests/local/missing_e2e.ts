// A missing turn says why, in the meeting itself (owner, 16 October 2026).
// One advisor is set up to fail (Claude out of credit, no backup); the round
// still counts, the advisor's entry says why, the Chair is told, and the
// failure is in the call log. Local stack, fake providers ($0).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const email = `missing-${tag}@example.test`, password = crypto.randomUUID();
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

const { data: co } = await F.from('companies').insert({ name: `missing ${tag}`, created_by_id: uid }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, marcus: `Marcus ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair, default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.grace, role: 'Customer Advocate', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.marcus, role: 'Finance Director', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  // Priya: every call she makes fails (scripted below).
  { name: names.priya, role: 'Product Strategist', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
].map((m) => ({ company_id: co.id, created_by_id: uid, type: 'ai', ...m }))).select();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair').map((a: any) => a.id);

// Every call Priya makes fails, on both providers (out of credit).
await script({ failFor: [names.priya], marks: [`${names.priya} gave no view this round`, '=== WHO GAVE A VIEW ===', `no view from ${names.priya}`] });
const id = crypto.randomUUID();
await call('startBoardMeeting', { company_id: co.id, question: 'Should we open a pop-up shop?', advisor_ids: debaters, meeting_id: id, server_driven: true, turn_shape: true });
let m: any;
for (let i = 0; i < 300; i++) { m = await row(id); if (m && ['discussion_complete', 'synthesizing', 'complete', 'failed'].includes(m.status)) break; await sleep(400); }
for (let i = 0; i < 300; i++) { m = await row(id); if (m && ['complete', 'failed'].includes(m.status)) break; await sleep(400); }

const r1 = (m?.independent_responses || []).find((r: any) => r.advisor_name === names.priya);
check(r1?.unavailable === true && /out of credit|overloaded/.test(r1?.unavailable_reason || '') && !!r1?.unavailable_detail,
  "Round 1: Priya's entry says why, in plain words and in detail", r1);
const later = (m?.discussion_transcript || []).filter((x: any) => x.round > 1 && x.advisor_name === names.priya);
check(later.length >= 1 && later.every((x: any) => x.unavailable && x.unavailable_reason && x.message_type === 'unavailable'),
  'every discussion round keeps an entry for her saying why, not a silent gap', later);
const others = (m?.discussion_transcript || []).filter((x: any) => x.round > 1 && !x.unavailable && x.advisor_id);
check(m?.discussion_rounds_completed >= 2 && others.length >= 2, 'the rounds still count: the others answered', [m?.discussion_rounds_completed, others.length]);
const chairSaw = (await fakeLog()).some((l: any) => l.marked.includes(`${names.priya} gave no view this round`));
check(chairSaw, 'the Chair is told who gave no view, and not to count it as agreement');
const counted = (await fakeLog()).some((l: any) => l.marked.includes('=== WHO GAVE A VIEW ===') && l.marked.includes(`no view from ${names.priya}`));
check(counted, 'and is given the count of who spoke in each round, naming who gave none');
const { data: logs } = await admin.from('ai_usage_logs').select('status, provider, request_type').eq('meeting_id', id).eq('advisor_id', advs!.find((a: any) => a.name === names.priya).id);
check((logs || []).length >= 2 && (logs || []).every((l: any) => l.status === 'error'), 'and each failure is in the call log', logs);

await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
