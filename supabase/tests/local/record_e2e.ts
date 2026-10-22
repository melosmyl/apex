// The company record (owner, 22 October 2026): what the founder said comes
// first, every statement of theirs dated, each commitment listed once and
// last, so a long list is what gets cut, never the founder's own words.
// A company like petit m: dated statements from earlier meetings, a board
// task's result, and 20 open commitments with repeats, more than fit.
// Local stack, fake providers ($0).
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const email = `record-${tag}@example.test`, password = crypto.randomUUID();
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

const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();
const { data: co } = await F.from('companies').insert({ name: `record ${tag}`, created_by_id: uid, description: 'Children\'s dinner sets', country: 'United Kingdom' }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, marcus: `Marcus ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair, default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.grace, role: 'Customer Advocate', default_provider: 'openai', default_model: 'gpt-4o', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.marcus, role: 'Finance Director', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
  { name: names.priya, role: 'Product Strategist', default_provider: 'anthropic', default_model: 'claude-sonnet-5-5', fallback_provider: 'openai', fallback_model: 'gpt-4o' },
].map((m) => ({ company_id: co.id, created_by_id: uid, type: 'ai', ...m }))).select();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair');
const marcus = advs!.find((a: any) => a.name === names.marcus);

// An earlier meeting, eight days ago, that the commitments came from.
const { data: past } = await admin.from('board_meetings').insert({ company_id: co.id, created_by_id: uid, question: 'Should we open a shop?', status: 'complete', created_at: ago(8),
  board_resolution: { recommended_direction: 'Not yet' } }).select().single();
// What the founder told the board, dated 15 October-style: seven days ago.
await admin.from('documents').insert([
  { company_id: co.id, created_by_id: uid, kind: 'knowledge', category: 'What you told the board', title: 'What you told the board: Should we open a shop?',
    content: "- I'm signing on Friday.\n- My one quote is £11 a set from a Stoke workshop.", created_at: ago(7) },
  // A board task's result: the board's work, not the founder's words.
  { company_id: co.id, created_by_id: uid, kind: 'knowledge', category: 'Calculation', title: 'Money left per set after Etsy fees',
    content: 'You keep £32.65 of £45.', created_by_advisor_id: marcus.id, created_at: ago(6) },
  // One the founder added.
  { company_id: co.id, created_by_id: uid, kind: 'document', category: 'Other', title: 'My supplier notes', content: 'Stoke can do 50 units.', created_at: ago(5) },
  // A full shelf of long research results, older: they must not push out
  // the founder's calls on past resolutions or the "not yet on file" list.
  ...Array.from({ length: 10 }, (_, i) => ({ company_id: co.id, created_by_id: uid, kind: 'knowledge', category: 'Research', title: `Research ${i + 1}`,
    content: 'A long finding with sources. '.repeat(20), created_by_advisor_id: marcus.id, created_at: ago(9 + i) })),
]);
// 20 open commitments: one wording agreed at three meetings, and 17 others,
// long enough together to overflow the record.
const tasks = [
  { title: 'Secure supplier quotes and lead times', created_at: ago(8) },
  { title: 'Secure supplier quotes and lead times.', created_at: ago(7) },
  { title: 'secure supplier quotes and lead times', created_at: ago(6) },
  ...Array.from({ length: 17 }, (_, i) => ({ title: `Commitment number ${i + 1}: a long piece of follow-up work agreed with the board that the founder still has to do. ${'It has a lot of detail in it, as the real ones often do. '.repeat(6)}`.trim(), created_at: ago(7) })),
];
await admin.from('tasks').insert(tasks.map((t) => ({ ...t, company_id: co.id, created_by_id: uid, source_meeting_id: past.id, status: 'todo' })));

await script({ marks: ['Today is ', "On ", "I'm signing on Friday", 'Outstanding commitments'] });
const id = crypto.randomUUID();
await call('startBoardMeeting', { company_id: co.id, question: 'Should we price at £45 or £65?', advisor_ids: debaters.map((a: any) => a.id), meeting_id: id, server_driven: true });
let m: any;
for (let i = 0; i < 300; i++) { m = await row(id); if (m && ['complete', 'failed'].includes(m.status)) break; await sleep(400); }
check(m?.status === 'complete', 'the meeting completes', m?.status);
const rec = String(m?.context_package || '');
const at = (s: string) => rec.indexOf(s);
const day7 = new Date(ago(7)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

check(rec.startsWith('Today is '), 'the record starts with today\'s date', rec.slice(0, 80));
check(rec.includes(`On ${day7}, in the meeting on "Should we open a shop?":\n- I'm signing on Friday.`), "each thing the founder told the board is dated, with the meeting it was said in", rec.slice(at('What the founder told'), at('What the founder told') + 300));
check(at("I'm signing on Friday") > 0 && at("I'm signing on Friday") < at('Outstanding commitments'), "the founder's words come before the commitments");
check(/\[\d+ \w+ \d{4}, the board's work\] Money left per set after Etsy fees/.test(rec) && /\[\d+ \w+ \d{4}, added by the founder\] My supplier notes/.test(rec),
  "documents are dated and say whose they are", rec.slice(at('Documents ('), at('Documents (') + 400));
check(/\[\d+ \w+ \d{4}\] Q: Should we open a shop\?/.test(rec), 'past meetings are dated');
const dupes = rec.split('"Secure supplier quotes and lead times').length - 1;
check(dupes === 1 && rec.includes('agreed 3 times in all'), 'a commitment agreed at three meetings is listed once, saying so', dupes);
check(rec.length <= 8000 + 60 && rec.includes("the rest of the record didn't fit") && at("the rest of the record didn't fit") > at('Outstanding commitments'),
  'a record that is too long loses the end of the commitments, nothing else', [rec.length, rec.slice(-120)]);
check(rec.includes('Q: Should we open a shop?') && rec.includes('Not yet on file about this company') && at('Not yet on file') < at('Documents ('),
  "a full shelf of documents doesn't push out past meetings or the 'not yet on file' list");
const docsPart = rec.slice(at('Documents ('), at('Outstanding commitments'));
check(docsPart.length < 2500 + 300 && docsPart.includes('My supplier notes'), 'documents stay within their own share, newest first', docsPart.length);
const panel = m?.memory_context?.open_commitments || [];
check(panel.length === 18, 'the page\'s memory panel lists each commitment once too', panel.length);

const log = (await fakeLog()).filter((l: any) => l.kind !== 'embedding' && l.kind !== 'research');
const later = log.filter((l: any) => l.marked.includes('Outstanding commitments'));
check(later.length > 0 && later.every((l: any) => l.marked.includes("I'm signing on Friday") && l.marked.includes('Today is ')),
  'every call that gets the full record (rounds, the Chair) also gets the founder\'s dated words and today\'s date', later.length);
const r1 = log.filter((l: any) => debaters.map((a: any) => a.name).includes(l.who) && !l.marked.includes('Outstanding commitments'));
check(r1.length > 0 && r1.every((l: any) => l.marked.includes("I'm signing on Friday") && l.marked.includes('Today is ')), "Round 1 (without the full list) gets them too", r1.length);

// A founder who has said a lot: their own part alone is longer than the
// limit. It stays whole; only what follows it is cut.
const long = (what: string) => `${what}. `.repeat(40).slice(0, 590);
await admin.from('companies').update({ industry: long('Children\'s tableware'), business_model: long('Direct sales'), target_customer: long('Grandparents buying christening gifts'),
  primary_market: long('UK'), available_capital: long('£3,500'), available_time: long('Evenings'), existing_assets: long('A quote'), current_challenges: long('Getting started'),
  immediate_goal: long('A sample'), confidence_gaps: long('Pricing'), deadlines: long('Christmas'), team_size: long('Just me') }).eq('id', co.id);
const id2 = crypto.randomUUID();
await call('startBoardMeeting', { company_id: co.id, question: 'Should we launch before Christmas?', advisor_ids: debaters.map((a: any) => a.id), meeting_id: id2, server_driven: true });
let m2: any;
for (let i = 0; i < 300; i++) { m2 = await row(id2); if (m2 && ['complete', 'failed'].includes(m2.status)) break; await sleep(400); }
const rec2 = String(m2?.context_package || '');
check(rec2.length > 8000 && rec2.includes('- Deadlines: Christmas') && rec2.includes("I'm signing on Friday") && rec2.includes('Q: Should we open a shop?')
  && rec2.indexOf("the rest of the record didn't fit") > rec2.indexOf('Q: Should we open a shop?'),
  "when the founder's own words alone are longer than the limit, none of them is cut; only what follows is", [rec2.length, rec2.slice(-100)]);

await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);
await admin.from('advisors').delete().eq('company_id', co.id);
await admin.from('companies').delete().eq('id', co.id);
await admin.auth.admin.deleteUser(uid);
console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
