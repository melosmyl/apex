// Workstream P1: the founder in the room, on the local stack against fake
// providers ($0). Notes reach the next round (a question to one advisor
// reaches that advisor), every round and the Chair get the same memory, the
// Chair sees the founder's words as the company record, the notes are kept
// in Knowledge, costs are recorded, the challenger rotates; typing holds the
// next step, Decide now and One more round work and are capped.
// Setup as in README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `p1-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await F.auth.signInWithPassword({ email, password });
const uid = s.user!.id, token = s.session!.access_token;
const call = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const act = (id: string, action: string, extra: Record<string, unknown> = {}) => call('meetingRun', { action, meeting_id: id, ...extra });
const row = async (id: string) => (await admin.from('board_meetings').select('*').eq('id', id).maybeSingle()).data;
const waitFor = async (id: string, done: (m: any) => boolean, ms = 240_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const m = await row(id);
    if (m && done(m) || Date.now() > end) return m;
    await sleep(500);
  }
};
const finished = (m: any) => ['complete', 'failed'].includes(m.status);
const rounds = (m: any) => [...new Set((m?.discussion_transcript || []).map((x: any) => x.round))];
const fakeLog = async () => (await (await fetch(`${FAKE}/__log`)).json()).filter((l: any) => l.kind !== 'embedding');
const script = (body: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(body) });

const { data: co } = await F.from('companies').insert({ name: `petit ${tag}`, description: 'Ceramic dinner sets', created_by_id: uid }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, victor: `Victor ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair }, { name: names.grace, role: 'Customer Advocate' },
  { library_key: 'contrarian', name: names.victor, role: 'The Contrarian' }, { name: names.priya, role: 'Product Strategist' },
].map((m, i) => ({ company_id: co.id, created_by_id: uid, type: 'ai', default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5', fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m }))).select();
const byName = (n: string) => advs!.find((a: any) => a.name === n);
const debaters = [names.grace, names.victor, names.priya].map((n) => byName(n).id);
// Something in Knowledge, to see which calls get the full memory.
const KNOW = `kiln-booked-for-november-${tag}`;
await F.from('documents').insert({ company_id: co.id, created_by_id: uid, kind: 'knowledge', category: 'Operations', title: 'Kiln', content: `Our ${KNOW}.` });
const slow = (ms: number) => Object.fromEntries([names.grace, names.victor, names.priya].map((n) => [n, ms]));
const start = async (question: string, pace = 'quick') => {
  const id = crypto.randomUUID();
  const r = await call('startBoardMeeting', { company_id: co.id, question, advisor_ids: debaters, meeting_id: id, server_driven: true, pace });
  if (r.status !== 200) console.log('start failed', r);
  return id;
};

// ---- 1. Notes, memory, the Chair, Knowledge, costs, the challenger.
console.log('== the founder speaks during the meeting');
const FACT = `we-already-sold-forty-sets-${tag}`, ASK = `priya-what-would-you-cut-${tag}`;
await script({ delayBy: slow(3000), marks: [FACT, ASK, KNOW, '[asked of you directly]', 'THE CHALLENGER', 'WHAT THE FOUNDER SAID IN THIS MEETING', 'Round 2 of', 'Round 3 of'] });
const A = await start('Should we sell at craft fairs?');
const n1 = await act(A, 'note', { text: `Fact: ${FACT}` });
const n2 = await act(A, 'note', { text: ASK, to_advisor_id: byName(names.priya).id });
check(n1.status === 200 && n2.status === 200 && n2.json?.note?.to_name === names.priya, 'two notes are taken while Round 1 runs, one addressed to Priya', [n1, n2.status]);
const mA = await waitFor(A, finished);
check(mA?.status === 'complete', 'the meeting finishes', mA?.status);
const r2 = (mA?.discussion_transcript || []).filter((x: any) => x.round === 2);
check(r2.slice(0, 2).every((x: any) => x.message_type === 'founder_message' && x.note_id) && r2.length === 5, 'Round 2 starts with the founder\'s two notes, then the three advisors', r2.map((x: any) => x.advisor_name));
const logA = await fakeLog();
const round2 = logA.filter((l: any) => l.marked.includes('Round 2 of'));
const round3 = logA.filter((l: any) => l.marked.includes('Round 3 of'));
check(round2.length === 3 && round2.every((l: any) => l.marked.includes(FACT) && l.marked.includes(ASK)), 'every Round 2 advisor is given what the founder said', round2.map((l: any) => [l.who, l.marked]));
const direct = round2.filter((l: any) => l.marked.includes('[asked of you directly]')).map((l: any) => l.who);
check(JSON.stringify(direct) === JSON.stringify([names.priya]), 'the question to Priya is marked as asked of her, and of nobody else', direct);
check(round3.length === 3 && round3.every((l: any) => l.marked.includes(FACT)), 'Round 3 still sees the founder\'s words, in the transcript', round3.map((l: any) => l.who));
check([...round2, ...round3].every((l: any) => l.marked.includes(KNOW)), 'every discussion round gets the full memory (Knowledge), not just the profile', [...round2, ...round3].map((l: any) => l.marked.includes(KNOW)));
const chairs = logA.filter((l: any) => l.who === names.chair && l.marked.includes('WHAT THE FOUNDER SAID IN THIS MEETING'));
check(chairs.length >= 1 && chairs.every((l: any) => l.marked.includes(FACT) && l.marked.includes(KNOW)), "the Chair gets the founder's words as the company record, and the full memory", chairs.map((l: any) => l.marked));
const challengers = (mA?.discussion_transcript || []).filter((x: any) => x.challenger).map((x: any) => [x.round, x.advisor_name]);
check(JSON.stringify(challengers) === JSON.stringify([[2, names.victor], [3, names.priya]]), 'the challenge duty goes to the Contrarian first, then rotates', challengers);
check(round2.some((l: any) => l.who === names.victor && l.marked.includes('THE CHALLENGER')) && !round2.some((l: any) => l.who !== names.victor && l.marked.includes('THE CHALLENGER')), 'only the challenger is told it is the challenger', round2.map((l: any) => [l.who, l.marked.includes('THE CHALLENGER')]));
const turns = (mA?.discussion_transcript || []).filter((x: any) => x.message_type !== 'founder_message');
check(Number(mA?.cost_usd) > 0 && turns.every((x: any) => Number.isFinite(x.cost_usd)), 'the meeting and every turn record what they cost', [mA?.cost_usd, turns.map((x: any) => x.cost_usd)]);
// Saved just after the resolution, in the background.
let kn: any[] | null = null;
for (let i = 0; i < 20 && !kn?.length; i++) { ({ data: kn } = await admin.from('documents').select('title, category, content, kind').eq('meeting_id', A)); if (!kn?.length) await sleep(500); }
check(kn?.length === 1 && kn[0].kind === 'knowledge' && kn[0].category === 'What you told the board' && kn[0].content.startsWith('- '), 'the facts the founder stated are kept in Knowledge, where they can edit them', kn);
const factCalls = (await fakeLog()).filter((l: any) => l.who === 'Record keeper');
check(factCalls.length === 1 && factCalls[0].model === 'gpt-4o-mini' && factCalls[0].marked.includes(FACT), 'the facts are picked out on the cheap tier, from what the founder said', factCalls.map((l: any) => [l.model, l.marked]));

console.log('\n== a follow-up sees the resolution');
await script({ marks: ["THE BOARD'S RESOLUTION", KNOW] });
const fu = await call('runFounderFollowup', { meeting_id: A, founder_message: 'Why craft fairs first?' });
const fuLog = await fakeLog();
check(fu.status === 200 && fuLog.length > 0 && fuLog.every((l: any) => l.marked.includes("THE BOARD'S RESOLUTION") && l.marked.includes(KNOW)), 'every follow-up answer is given the resolution and the full memory', fuLog.map((l: any) => l.marked));

// ---- 3. Decide now, and a note the Chair gets.
console.log('\n== Decide now');
// Only a question and a view this time: no facts, so nothing for Knowledge.
await script({ delayBy: slow(3000), marks: [`late-note-${tag}`], fields: { facts: [[]] } });
const C = await start('Should we open a shop?');
await waitFor(C, (m) => m.status === 'discussing' && !!m.step_claimed_at, 60_000);
const d1 = await act(C, 'decide');
const late = await act(C, 'note', { text: `late-note-${tag}` });
const mC = await waitFor(C, finished);
check(d1.status === 200 && mC?.status === 'complete' && JSON.stringify(rounds(mC)) === '[1,2]', 'the round under way finishes, then the Chair resolves: no Round 3', [d1.status, rounds(mC)]);
const chairC = (await fakeLog()).filter((l: any) => l.who === names.chair && l.marked.includes(`late-note-${tag}`));
check(late.status === 200 && chairC.length >= 1 && !(mC?.discussion_transcript || []).some((x: any) => x.message === `late-note-${tag}`), 'a note sent after that goes to the Chair, not to a round', [late.status, chairC.length]);
const tooLate = await act(C, 'note', { text: 'and another thing' });
check(tooLate.status === 409, 'a finished meeting takes no more notes', tooLate.status);
await sleep(3000);
const { data: knC } = await admin.from('documents').select('id').eq('meeting_id', C);
check((knC || []).length === 0, 'notes with no facts in them add nothing to Knowledge', knC);

// ---- 4. One more round, capped; notes capped and checked.
console.log('\n== One more round, and the limits');
await script({ delayBy: slow(1000) });
const D = await start('Should we hire?');
const m1 = await act(D, 'more'), m2 = await act(D, 'more'), m3 = await act(D, 'more');
check(m1.json?.extra_rounds === 1 && m2.json?.extra_rounds === 2 && m2.json?.rounds_target === 5 && m3.status === 409, 'two extra rounds (to Round 5), then no more', [m1.json, m2.json, m3.status]);
const long = await act(D, 'note', { text: 'x'.repeat(2001) });
const stranger = await act(D, 'note', { text: 'hi', to_advisor_id: byName(names.chair).id });
check(long.status === 400 && stranger.status === 400, "a note that's too long, or for someone not in the meeting, is refused", [long.status, stranger.status]);
const sent = [];
for (let i = 0; i < 7; i++) sent.push((await act(D, 'note', { text: `note ${i}` })).status);
check(JSON.stringify(sent) === JSON.stringify([200, 200, 200, 200, 200, 200, 409]), 'up to six notes a meeting', sent);
const { error: forged } = await F.from('board_meetings').update({ founder_notes: [{ id: 'x', text: 'forged' }], extra_rounds: 2 }).eq('id', D);
const afterForge = await row(D);
check(!!forged && (afterForge?.founder_notes || []).every((n: any) => n.text !== 'forged'), "the page can't write notes or rounds itself", forged?.message);
const mD = await waitFor(D, finished);
check(mD?.status === 'complete' && JSON.stringify(rounds(mD)) === '[1,2,3,4,5]', 'the meeting runs five rounds', rounds(mD));
const other = createClient(URL, ANON, { auth: { persistSession: false } });
const oEmail = `p1-other-${tag}@example.test`;
await admin.auth.admin.createUser({ email: oEmail, password, email_confirm: true });
const { data: os } = await other.auth.signInWithPassword({ email: oEmail, password });
const oNote = await fetch(`${URL}/functions/v1/meetingRun`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${os.session!.access_token}`, apikey: ANON }, body: JSON.stringify({ action: 'note', meeting_id: D, text: 'hello' }) });
check(oNote.status === 403 || oNote.status === 404, "another user can't speak in someone else's meeting", oNote.status);

const { error: rpcErr } = await F.rpc('append_founder_note', { p_meeting_id: D, p_note: { id: 'x', text: 'direct' }, p_max: 99 });
check(!!rpcErr, "the founder can't call the note function directly", rpcErr?.message);

// ---- 5. One more round after the discussion settled early: exactly one.
console.log('\n== One more round after an early end');
// Distinct recommendations (no convergence) and no new risks: the room
// settles after Round 2.
await script({ delayBy: slow(2500), fields: { new_risks: Array(40).fill([]), recommendation: ['apples and pears', 'zebra crossing now', 'quantum kiln timing'] } });
// Sit in, so the meeting stops after the discussion settles.
const E = await start('Should we sell at markets?', 'sit_in');
let e = await waitFor(E, (m) => m.waiting_for_founder, 60_000);
while (e && e.status !== 'discussion_complete') { await act(E, 'carry_on'); e = await waitFor(E, (m) => m.waiting_for_founder && m.updated_at !== e.updated_at, 60_000); }
const settled = e;
const reopen = await act(E, 'more');
// Round 3 runs, then Sit in stops again before the Chair.
const afterMore = await waitFor(E, (m) => m.status === 'discussion_complete' && m.waiting_for_founder && m.discussion_rounds_completed === 3, 60_000);
await act(E, 'carry_on');
const mE = await waitFor(E, finished);
check(settled?.discussion_rounds_completed === 2 && reopen.json?.rounds_target === 3 && JSON.stringify(rounds(mE)) === '[1,2,3]',
  'it settled at Round 2; one more round runs Round 3 only', [settled?.discussion_rounds_completed, reopen.json, rounds(mE)]);

// ---- 8. P1.1: a change of position after the founder pushes back is recorded.
console.log('\n== changing position after the founder pushes back');
await script({ delayBy: slow(2000), fields: { changed_opinion: Array(40).fill(true), new_position: Array(40).fill('Go ahead with it.'), reply_to_advisor: Array(40).fill('Founder') } });
const J = await start('Should we sign the Chelsea lease?');
await act(J, 'note', { text: "I've decided. Just plan it." });
const mJ = await waitFor(J, finished);
const flagged = (mJ?.discussion_transcript || []).filter((x: any) => x.after_founder_pushback).map((x: any) => x.round);
check(flagged.length === 3 && flagged.every((r: number) => r === 2), 'changes right after the founder spoke are marked; the same change a round later is not', flagged);
const dis = mJ?.board_resolution?.disagreements || [];
check(/changed position after you spoke/.test(dis[0] || '') && [names.grace, names.victor, names.priya].every((n) => dis[0].includes(n)) && dis.includes('fake disagreements'),
  "all three are listed where the room disagreed, in one line, and the Chair's own line stays", dis);
const fJ = await call('runFounderFollowup', { meeting_id: J, founder_message: 'Stop hedging.' });
const fu2 = (await row(J))?.discussion_transcript?.filter((x: any) => x.round > 3 && x.message_type !== 'founder_message') || [];
check(fJ.status === 200 && fu2.length === 3 && fu2.every((x: any) => x.after_founder_pushback && Number.isFinite(x.cost_usd)), 'in a follow-up too, a change is marked as after the founder pushed back, and each answer records its cost', fu2.map((x: any) => [x.after_founder_pushback, x.cost_usd]));

// The fake data made for this test is removed.
await script({});
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
