// The founder's profile reaches every stage of a meeting (Round 1, the
// opening, discussion rounds, the Chair's results and follow-ups), on the
// local stack against fake providers ($0). Setup as in README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const MATERIAL = `ceramic with silicone cradle ${tag}`, CHALLENGE = `getting it up and running ${tag}`;

const email = `profile-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await F.auth.signInWithPassword({ email, password });
const uid = s.user!.id, token = s.session!.access_token;
const fn = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const GENERATED = `Generated type ${tag}`;
const { data: co } = await F.from('companies').insert({ name: `petit ${tag}`, description: `Children's dinner sets. ${MATERIAL}.`, current_challenges: CHALLENGE, stage: 'idea_validation', company_type: GENERATED, tagline: `Welcome aboard ${tag}`, created_by_id: uid }).select().single();
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` }, { name: `Grace ${tag}`, role: 'Customer Advocate' },
  { name: `Marcus ${tag}`, role: 'Finance Director' }, { name: `Priya ${tag}`, role: 'Product Strategist' },
].map((m, i) => ({ company_id: co.id, created_by_id: uid, type: 'ai', default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5', fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m }))).select();

const stage = async (label: string, run: () => Promise<unknown>) => {
  await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({ marks: [MATERIAL, CHALLENGE, GENERATED, `Welcome aboard ${tag}`] }) });
  const res: any = await run();
  // Model calls only: embeddings (board memory) carry no profile.
  const log = (await (await fetch(`${FAKE}/__log`)).json()).filter((l: any) => l.kind !== 'embedding');
  const ok = res?.status === 200 && log.length > 0 && log.every((l: any) => l.marked.includes(MATERIAL) && l.marked.includes(CHALLENGE));
  check(ok, `${label}: every call is given the founder's profile (${log.length} calls)`, { status: res?.status, calls: log.map((l: any) => [l.who, l.marked]) });
  check(!log.some((l: any) => l.marked.includes(GENERATED) || l.marked.includes(`Welcome aboard ${tag}`)), `${label}: onboarding's generated type and tagline are not passed off as the founder's words`);
};

let meetingId = '';
await stage('Round 1 and the opening', async () => {
  const r = await fn('startBoardMeeting', { company_id: co.id, question: 'How do I validate demand?', advisor_ids: advs!.map((a: any) => a.id) });
  meetingId = r.json?.meeting_id;
  return r;
});
await stage('the discussion rounds', () => fn('runBoardDiscussion', { meeting_id: meetingId }));
await stage("the Chair's results", () => fn('runChairSynthesis', { meeting_id: meetingId }));
await stage('a follow-up', () => fn('runFounderFollowup', { meeting_id: meetingId, founder_message: 'What would you check first?' }));

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
