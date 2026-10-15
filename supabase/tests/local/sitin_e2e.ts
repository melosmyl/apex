// "Sit in" (owner, 15 October 2026), on the local stack against fake
// providers ($0): the meeting stops after every round and waits for the
// founder; Carry on, a note (answered first in the next round), Decide now
// or One more round move it on; a note after the last round gets one more
// round. "Ask the board" (Quick) never stops. Setup as in README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const email = `sitin-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: s } = await F.auth.signInWithPassword({ email, password });
const uid = s.user!.id, token = s.session!.access_token;
const call = async (name: string, body: unknown, bearer = token) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const act = (id: string, action: string, extra: Record<string, unknown> = {}) => call('meetingRun', { action, meeting_id: id, ...extra });
const row = async (id: string) => (await admin.from('board_meetings').select('*').eq('id', id).maybeSingle()).data;
const waitFor = async (id: string, done: (m: any) => boolean, ms = 120_000) => {
  const end = Date.now() + ms;
  for (;;) { const m = await row(id); if (m && done(m) || Date.now() > end) return m; await sleep(400); }
};
const finished = (m: any) => ['complete', 'failed'].includes(m.status);
const rounds = (m: any) => [...new Set((m?.discussion_transcript || []).map((x: any) => x.round))];
const script = (body: unknown) => fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify(body) });
const fakeLog = async () => (await (await fetch(`${FAKE}/__log`)).json()).filter((l: any) => l.kind !== 'embedding' && l.kind !== 'email');
const sweep = () => call('meetingRun', { action: 'sweep' }, SERVICE);

const { data: co } = await F.from('companies').insert({ name: `petit ${tag}`, created_by_id: uid }).select().single();
const names = { chair: `Margaret ${tag}`, grace: `Grace ${tag}`, marcus: `Marcus ${tag}`, priya: `Priya ${tag}` };
const { data: advs } = await F.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: names.chair }, { name: names.grace, role: 'Customer Advocate' },
  { name: names.marcus, role: 'Finance Director' }, { name: names.priya, role: 'Product Strategist' },
].map((m, i) => ({ company_id: co.id, created_by_id: uid, type: 'ai', default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5', fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m }))).select();
const byName = (n: string) => advs!.find((a: any) => a.name === n);
const debaters = [names.grace, names.marcus, names.priya].map((n) => byName(n).id);
const start = async (question: string, pace: string) => {
  const id = crypto.randomUUID();
  await call('startBoardMeeting', { company_id: co.id, question, advisor_ids: debaters, meeting_id: id, server_driven: true, pace });
  return id;
};
// Waits for the next stop after the given one.
const nextStop = (id: string, after: any) => waitFor(id, (m) => m.waiting_for_founder && m.updated_at !== after?.updated_at);

// ---- 1. Sit in: a stop after every round.
console.log('== Sit in stops after every round');
const ASK = `priya-what-would-you-cut-${tag}`, LAST = `one-last-thing-${tag}`;
await script({ marks: [ASK, LAST, '[asked of you directly]', 'Answer the founder first', 'Round 2 of', 'Round 3 of', 'Round 4 of', 'Why: ', '-> Arguments: '] });
const A = await start('Should we sell at craft fairs?', 'sit_in');
const s1 = await waitFor(A, (m) => m.waiting_for_founder);
await sleep(3000);
await sweep();
const held = await row(A);
check(s1?.pace === 'sit_in' && held?.status === 'independent_complete' && held?.waiting_for_founder && !(held?.discussion_transcript || []).length,
  'after Round 1 it waits for the founder, and the sweep leaves it alone', [held?.status, held?.waiting_for_founder]);
const r1 = held?.independent_responses || [];
check(r1.length === 3 && r1.every((r: any) => r.because?.trim()), 'every Round 1 position comes with its reason', r1.map((r: any) => [r.advisor_name, r.because]));
await act(A, 'carry_on');
const s2 = await nextStop(A, held);
const opening = (s2?.discussion_transcript || []).filter((x: any) => x.round === 1);
const log2 = (await fakeLog()).filter((l: any) => l.marked.includes('Round 2 of'));
check(opening.length === 3 && opening.every((x: any) => /\nWhy: \S/.test(x.message)) && log2.length === 3 && log2.every((l: any) => l.marked.includes('Why: ') && l.marked.includes('-> Arguments: ')),
  'Round 2 sees each position with its reason and top arguments', [opening.map((x: any) => x.message), log2.map((l: any) => l.marked)]);
check(s2?.status === 'discussing' && s2?.discussion_rounds_completed === 2 && s2?.waiting_for_founder, 'Carry on: Round 2 runs, then it stops again', [s2?.status, s2?.discussion_rounds_completed]);

console.log('\n== a note is answered first in the next round');
const n1 = await act(A, 'note', { text: ASK, to_advisor_id: byName(names.priya).id });
const s3 = await nextStop(A, s2);
const r3 = (s3?.discussion_transcript || []).filter((x: any) => x.round === 3);
check(n1.status === 200 && s3?.discussion_rounds_completed === 3 && r3[0]?.message_type === 'founder_message' && r3[0]?.note_id === n1.json?.note?.id,
  'the note starts Round 3 straight away, and opens its minutes', [n1.status, r3.map((x: any) => x.advisor_name)]);
const log3 = (await fakeLog()).filter((l: any) => l.marked.includes('Round 3 of'));
check(log3.length === 3 && log3.every((l: any) => l.marked.includes(ASK) && l.marked.includes('Answer the founder first'))
  && JSON.stringify(log3.filter((l: any) => l.marked.includes('[asked of you directly]')).map((l: any) => l.who)) === JSON.stringify([names.priya]),
  'every advisor is told to answer the founder first; the question is marked as Priya\'s', log3.map((l: any) => [l.who, l.marked]));
check(s3?.status === 'discussion_complete' && s3?.waiting_for_founder, 'after the last round it stops before the Chair', [s3?.status, s3?.waiting_for_founder]);

console.log('\n== a note after the last round gets one more round');
const n2 = await act(A, 'note', { text: LAST });
const s4 = await nextStop(A, s3);
const log4 = (await fakeLog()).filter((l: any) => l.marked.includes('Round 4 of'));
check(n2.json?.answered_in === 'one more round' && n2.json?.extra_rounds === 1 && s4?.discussion_rounds_completed === 4 && log4.length === 3 && log4.every((l: any) => l.marked.includes(LAST)),
  'the board answers it in Round 4, then stops again', [n2.json, s4?.discussion_rounds_completed, log4.length]);
await act(A, 'carry_on');
const mA = await waitFor(A, finished);
check(mA?.status === 'complete' && JSON.stringify(rounds(mA)) === '[1,2,3,4]', 'Carry on to the decision: the Chair resolves', [mA?.status, rounds(mA)]);

// ---- 2. Decide now from a stop.
console.log('\n== Decide now from a stop');
await script({});
const B = await start('Should we hire?', 'sit_in');
const b1 = await waitFor(B, (m) => m.waiting_for_founder);
const d = await act(B, 'decide');
const mB = await waitFor(B, finished);
check(b1?.status === 'independent_complete' && d.json?.step === 'synthesis' && mB?.status === 'complete' && !(mB?.discussion_transcript || []).some((x: any) => x.round > 1),
  'the Chair resolves from Round 1, no more rounds', [d.json, mB?.status, rounds(mB)]);

// ---- 3. Quick never stops; the page can't choose a pace by itself.
console.log('\n== Ask the board (Quick)');
const Q = await start('Should we open a shop?', 'quick');
const seen: boolean[] = [];
const mQ = await waitFor(Q, (m) => { seen.push(!!m.waiting_for_founder); return finished(m); });
check(mQ?.status === 'complete' && mQ?.pace === 'quick' && seen.every((w) => !w) && JSON.stringify(rounds(mQ)) === '[1,2,3]', 'a Quick meeting runs straight through, as today', [mQ?.status, mQ?.pace]);
const J = await start('Should we raise prices?', 'join');
check((await row(J))?.pace === 'quick', 'Join the board isn\'t built yet: asking for it gives Quick', (await row(J))?.pace);
const { data: forged } = await F.from('board_meetings').insert({ company_id: co.id, created_by_id: uid, question: 'x', status: 'preparing', pace: 'sit_in', waiting_for_founder: true }).select('pace, waiting_for_founder').single();
check(forged?.pace === 'quick' && forged?.waiting_for_founder === false, 'a meeting the browser makes is always Quick', forged);
await waitFor(J, finished);

// ---- 4. The independent review's cases.
console.log('\n== a note sent while the last round is being written');
const LATE = `late-note-${tag}`;
await script({ delayBy: { [names.grace]: 5000 }, marks: [LATE, 'Round 4 of'] });
const C = await start('Should we take a wholesale order?', 'sit_in');
const c1 = await waitFor(C, (m) => m.waiting_for_founder);
await act(C, 'carry_on', { at: { status: c1.status, rounds: c1.discussion_rounds_completed } });
const c2 = await nextStop(C, c1);
await act(C, 'carry_on', { at: { status: 'independent_complete', rounds: 0 } });
await sleep(1500);
const c2b = await row(C);
check(c2?.discussion_rounds_completed === 2 && c2b?.waiting_for_founder && c2b?.discussion_rounds_completed === 2,
  'a late Carry on meant for an earlier stop leaves this one alone', [c2b?.status, c2b?.waiting_for_founder]);
await act(C, 'carry_on', { at: { status: c2.status, rounds: c2.discussion_rounds_completed } });
const running = await waitFor(C, (m) => m.status === 'discussing' && !!m.step_claimed_at && !m.waiting_for_founder, 30_000);
const n3 = await act(C, 'note', { text: LATE });
const c3 = await nextStop(C, running);
check(!!running?.step_claimed_at && n3.status === 200 && c3?.status === 'discussion_complete' && c3?.waiting_for_founder && c3?.discussion_rounds_completed === 3,
  'the last round ends without it, and the meeting stops', [n3.status, c3?.status, c3?.discussion_rounds_completed]);
const cOn = await act(C, 'carry_on', { at: { status: c3.status, rounds: c3.discussion_rounds_completed } });
const c4 = await nextStop(C, c3);
const r4 = (c4?.discussion_transcript || []).filter((x: any) => x.round === 4);
const log4b = (await fakeLog()).filter((l: any) => l.marked.includes('Round 4 of'));
check(cOn.json?.answered_in === 'one more round' && c4?.extra_rounds === 1 && r4[0]?.note_id === n3.json?.note?.id && log4b.length === 3 && log4b.every((l: any) => l.marked.includes(LATE)),
  'carrying on gives the note its own round', [cOn.json, c4?.extra_rounds, r4.map((x: any) => x.advisor_name)]);
await act(C, 'carry_on', { at: { status: c4.status, rounds: c4.discussion_rounds_completed } });
const mC = await waitFor(C, finished);
check(mC?.status === 'complete', 'then on to the decision', mC?.status);

console.log('\n== Decide now that lands as a round finishes');
await script({});
const D = await start('Should we hire a part-time maker?', 'sit_in');
await waitFor(D, (m) => m.waiting_for_founder);
// Both flags at once: the founder asked for the decision as the round's
// save wrote the stop.
await admin.from('board_meetings').update({ decide_now: true }).eq('id', D);
// The cron job calls the sweep every minute; it picks the meeting up once
// it has sat for the usual grace.
await sleep(31_000);
await sweep();
const mD = await waitFor(D, finished, 60_000);
check(mD?.status === 'complete', 'the Chair still decides: the meeting never sticks at the stop', [mD?.status, mD?.waiting_for_founder]);

// ---- 5. The turn shape (Workstream I, every pace).
console.log('\n== every turn has its shape, and the Chair hears what failed');
await script({ marks: ['YOUR TURN HAS A SHAPE', '120 words at most', 'No numbered or bulleted lists', 'Final round: against_me', '[SAME POINT AS ', 'TURNS THAT FAILED A CHECK'] });
const T = await start('Should we sell at a Christmas fair?', 'quick');
const mT = await waitFor(T, finished);
const later2 = (mT?.discussion_transcript || []).filter((x: any) => x.round > 1 && x.message_type !== 'founder_message');
check(later2.length === 6 && later2.every((x: any) => x.position && x.because && x.stance && Array.isArray(x.flags)),
  'every discussion turn is saved with its position, reason, stance and checks', later2.map((x: any) => [x.advisor_name, x.stance, x.flags]));
// The fake answers are word for word the same, and the answer form's first
// name is the first advisor's own (the reason check is in the unit tests:
// this company's record holds earlier fake meetings' words).
check(later2.filter((x: any) => !x.reply_to_advisor).length === 2 && later2.filter((x: any) => !x.reply_to_advisor).every((x: any) => x.flags.includes('answers_no_one'))
  && later2.every((x: any) => x.flags.some((f: string) => f.startsWith('same_point:')))
  && later2.filter((x: any) => x.round === 3).every((x: any) => x.flags.some((f: string) => f.startsWith('repeats:'))),
  'a turn that answers no one, makes the same point as another, or repeats an earlier round, is flagged', later2.map((x: any) => x.flags));
const tlog = await fakeLog();
const r2 = tlog.filter((l: any) => l.marked.includes('YOUR TURN HAS A SHAPE'));
check(r2.length === 6 && r2.every((l: any) => l.marked.includes('120 words at most'))
  && r2.filter((l: any) => l.marked.includes('Final round: against_me')).length === 3 && r2.filter((l: any) => l.marked.includes('No numbered or bulleted lists')).length === 3,
  'every advisor is given the shape, the 120-word cap, and the final round\'s extra parts', r2.map((l: any) => l.marked));
const chairLog = tlog.filter((l: any) => l.who === names.chair && l.marked.includes('TURNS THAT FAILED A CHECK'));
check(chairLog.length >= 1 && chairLog.some((l: any) => l.marked.includes('[SAME POINT AS ')), 'the Chair sees the failed turns tagged', chairLog.map((l: any) => l.marked));

// The fake data made for this test is removed.
await admin.from('documents').delete().eq('company_id', co.id);
await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
