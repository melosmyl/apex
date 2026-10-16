// Facts about the business come only from the record or the founder's own
// words; anything else is a question, never a premise (owner, 16 October
// 2026). Every call in a meeting that sees the company record carries the
// rule, straight after the record: the Chair's opening, Round 1, each
// discussion round, the Chair's resolution and the founder's follow-ups.
// (What a real model does with it is checked on the live re-test; here the
// providers are fakes, $0.)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const email = `facts-${tag}@example.test`, password = crypto.randomUUID();
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

const RULE = '=== FACTS ABOUT THIS BUSINESS ===';
const RESOLUTION = '=== HOW TO WRITE THIS RESOLUTION ===';
const { data: co } = await F.from('companies').insert({ name: `facts ${tag}`, created_by_id: uid, description: 'Supper clubs for women in surfing' }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, marcus: `Marcus ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair, default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.grace, role: 'Customer Advocate', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.marcus, role: 'Finance Director', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.priya, role: 'Product Strategist', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
].map((m) => ({ company_id: co.id, created_by_id: uid, type: 'ai', ...m }))).select();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair');

await script({ marks: [RULE, RESOLUTION, 'Supper clubs for women in surfing'] });
const id = crypto.randomUUID();
await call('startBoardMeeting', { company_id: co.id, question: 'Should we run a winter supper series?', advisor_ids: debaters.map((a: any) => a.id), meeting_id: id, server_driven: true, turn_shape: true });
let m: any;
for (let i = 0; i < 300; i++) { m = await row(id); if (m && ['complete', 'failed'].includes(m.status)) break; await sleep(400); }
check(m?.status === 'complete', 'the meeting completes', m?.status);
const fu = await call('runFounderFollowup', { meeting_id: id, founder_message: 'What would you check first?' });
check(fu.status === 200, 'a follow-up runs', fu);

const log = (await fakeLog()).filter((l: any) => l.kind !== 'embedding' && l.kind !== 'research');
const withRecord = log.filter((l: any) => l.marked.includes('Supper clubs for women in surfing'));
const debaterNames = debaters.map((a: any) => a.name);
const advisorCalls = log.filter((l: any) => debaterNames.includes(l.who));
check(advisorCalls.length >= 9, 'the advisors spoke in Round 1, the discussion and the follow-up', advisorCalls.length);
check(advisorCalls.every((l: any) => l.marked.includes(RULE)), "every advisor's call carries the facts rule", advisorCalls.filter((l: any) => !l.marked.includes(RULE)).map((l: any) => l.who));
check(log.some((l: any) => l.who === names.chair && l.marked.includes(RESOLUTION) && l.marked.includes(RULE)), "the Chair's resolution carries it");
check(withRecord.length > 0 && withRecord.every((l: any) => l.marked.includes(RULE)), 'every call that sees the company record carries it',
  withRecord.filter((l: any) => !l.marked.includes(RULE)).map((l: any) => l.who));
const { data: usage } = await admin.from('ai_usage_logs').select('request_type').eq('meeting_id', id);
const types = new Set((usage || []).map((u: any) => u.request_type));
check(['chair_opening', 'independent', 'chair_synthesis', 'founder_followup'].every((t) => types.has(t)) && [...types].some((t) => String(t).startsWith('discussion_round')),
  'the opening, Round 1, the rounds, the resolution and the follow-up all ran', [...types]);

await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);
await admin.from('advisors').delete().eq('company_id', co.id);
await admin.from('companies').delete().eq('id', co.id);
await admin.auth.admin.deleteUser(uid);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
