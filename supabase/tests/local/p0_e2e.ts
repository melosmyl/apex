// Workstream P0: the server runs the meeting, on the local stack against
// fake providers ($0). A meeting started by the page finishes with nobody
// watching; human advisors' views are waited for; the sweep picks up a
// stalled round and a meeting left between steps; it gives up after three
// tries and the founder can try again. Setup as in README.md.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL = 'http://127.0.0.1:54321', ANON = Deno.env.get('LOCAL_ANON_KEY')!, SERVICE = Deno.env.get('LOCAL_SERVICE_KEY')!;
const FAKE = 'http://127.0.0.1:54399';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const tag = Date.now().toString(36);
let failures = 0;
const check = (ok: boolean, what: string, detail?: unknown) => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ''}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const signUp = async (who: string) => {
  const email = `${who}-${tag}@example.test`, password = crypto.randomUUID();
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.signInWithPassword({ email, password });
  return { c, uid: data.user!.id, token: data.session!.access_token };
};
const call = async (token: string, name: string, body: unknown) => {
  const t0 = Date.now();
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null), ms: Date.now() - t0 };
};
const sweep = () => call(SERVICE, 'meetingRun', { action: 'sweep' });
const row = async (id: string) => (await admin.from('board_meetings').select('*').eq('id', id).maybeSingle()).data;
const waitFor = async (id: string, done: (m: any) => boolean, ms = 240_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const m = await row(id);
    if (m && done(m) || Date.now() > end) return m;
    await sleep(1500);
  }
};
const rounds = (m: any) => [...new Set((m?.discussion_transcript || []).map((x: any) => x.round))];

const owner = await signUp('p0');
const { data: co } = await owner.c.from('companies').insert({ name: `petit ${tag}`, created_by_id: owner.uid }).select().single();
const { data: advs } = await owner.c.from('advisors').insert([
  { library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` }, { name: `Grace ${tag}`, role: 'Customer Advocate' },
  { name: `Marcus ${tag}`, role: 'Finance Director' }, { name: `Priya ${tag}`, role: 'Product Strategist' },
].map((m, i) => ({ company_id: co.id, created_by_id: owner.uid, type: 'ai', default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5', fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m }))).select();
const { data: human } = await owner.c.from('advisors').insert({ company_id: co.id, created_by_id: owner.uid, type: 'human', name: `Aunt Jo ${tag}`, role: 'Mentor' }).select().single();
const debaters = advs!.filter((a: any) => a.library_key !== 'chair').map((a: any) => a.id);
await fetch(`${FAKE}/__script`, { method: 'POST', body: JSON.stringify({}) });

// ---- 1. A meeting the server runs to the end, with nobody watching.
console.log('== the server runs the meeting');
const id1 = crypto.randomUUID();
const s1 = await call(owner.token, 'startBoardMeeting', { company_id: co.id, question: 'Should we sell at craft fairs?', advisor_ids: debaters, meeting_id: id1, server_driven: true });
check(s1.status === 200 && s1.json?.status === 'preparing' && s1.ms < 8000, `starting answers at once, before Round 1 (${s1.ms}ms)`, s1);
const m1 = await waitFor(id1, (m) => ['complete', 'failed'].includes(m.status));
check(m1?.status === 'complete' && !!m1?.board_resolution, 'the meeting finishes with a resolution, without the page calling any step', { status: m1?.status, reason: m1?.failure_reason });
check(JSON.stringify(rounds(m1)) === '[1,2,3]' && m1?.discussion_rounds_completed === 3, 'Round 1 and both discussion rounds ran', rounds(m1));
check(m1?.driver === 'server' && m1?.step_attempts === 0 && m1?.step_claimed_at === null, 'the meeting ends with no step held', [m1?.driver, m1?.step_attempts, m1?.step_claimed_at]);
check(Array.isArray(m1?.convergence_candidates), 'convergence is worked out once, before Round 2', m1?.convergence_candidates);
const { data: tasks1 } = await admin.from('tasks').select('id').eq('source_meeting_id', id1);
check((tasks1 || []).length > 0, 'the resolution\'s actions become tasks, as before', tasks1?.length);
const { data: logs1 } = await admin.from('ai_usage_logs').select('request_type').eq('meeting_id', id1);
const kinds = [...new Set((logs1 || []).map((l: any) => l.request_type))].sort();
check(['chair_opening', 'chair_synthesis', 'discussion_round_2', 'discussion_round_3', 'independent'].every((k) => kinds.includes(k)), 'every call is logged against the meeting', kinds);

console.log('\n== the page no longer drives a server-run meeting');
const p1 = await call(owner.token, 'runBoardDiscussion', { meeting_id: id1 });
const p2 = await call(owner.token, 'runChairSynthesis', { meeting_id: id1 });
check(p1.status === 409 && p2.status === 409, 'the step functions refuse the page for a server-run meeting', [p1.status, p2.status]);

// ---- 2. Human advisors: the meeting waits after Round 1.
console.log('\n== human advisors are waited for');
const id2 = crypto.randomUUID();
await call(owner.token, 'startBoardMeeting', { company_id: co.id, question: 'Should we hire a part-timer?', advisor_ids: [...debaters, human.id], meeting_id: id2, server_driven: true, await_humans: true });
let m2 = await waitFor(id2, (m) => m.status !== 'preparing', 120_000);
await sleep(4000);
await sweep();
m2 = await row(id2);
check(m2?.status === 'independent_complete' && m2?.awaiting_human_input === true, 'after Round 1 it waits for the founder, and the sweep leaves it alone', [m2?.status, m2?.awaiting_human_input]);
const VIEW = `Hire someone local first ${tag}`;
await owner.c.from('board_meetings').update({ independent_responses: [...m2.independent_responses, { advisor_id: human.id, advisor_name: human.name, role: 'Mentor', position: VIEW, recommendation: VIEW, risks: [], confidence_score: 70 }] }).eq('id', id2);
const other = await signUp('other');
const o1 = await call(other.token, 'meetingRun', { action: 'continue', meeting_id: id2 });
check(o1.status === 403 || o1.status === 404, "another user can't move someone else's meeting on", o1.status);
const c2 = await call(owner.token, 'meetingRun', { action: 'continue', meeting_id: id2 });
check(c2.status === 200 && c2.json?.step === 'round', 'the founder sends the views and the discussion starts', c2);
m2 = await waitFor(id2, (m) => ['complete', 'failed'].includes(m.status));
check(m2?.status === 'complete' && (m2?.discussion_transcript || []).some((x: any) => x.round === 1 && x.message === VIEW), 'the meeting finishes, with the human view in Round 1', m2?.status);

// ---- 3. The sweep: a stalled round, and a meeting left between steps.
console.log('\n== the sweep picks meetings up');
const base = { company_id: co.id, created_by_id: owner.uid, question: 'Is £45 the right price?', participants: m1.participants, participant_advisor_ids: m1.participant_advisor_ids, independent_responses: m1.independent_responses, challenge_responses: [], driver: 'server' };
const old = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ids = { stalled: crypto.randomUUID(), idle: crypto.randomUUID(), fresh: crypto.randomUUID(), spent: crypto.randomUUID() };
const { error: seedErr } = await admin.from('board_meetings').insert([
  // A round whose worker died five minutes ago.
  { ...base, id: ids.stalled, status: 'discussing', step_claimed_at: old(5), step_attempts: 1, discussion_rounds_completed: 0, updated_at: old(5) },
  // Round 1 done a minute ago, and nobody moved it on.
  { ...base, id: ids.idle, status: 'independent_complete', step_claimed_at: null, step_attempts: 0, discussion_rounds_completed: 0, updated_at: old(1) },
  // A round taken ten seconds ago: still running, left alone.
  { ...base, id: ids.fresh, status: 'discussing', step_claimed_at: new Date(Date.now() - 10_000).toISOString(), step_attempts: 1, discussion_rounds_completed: 0, updated_at: new Date().toISOString() },
  // A round that has already failed three times.
  { ...base, id: ids.spent, status: 'discussing', step_claimed_at: old(5), step_attempts: 3, discussion_rounds_completed: 0, updated_at: old(5) },
]);
check(!seedErr, 'test meetings in each state are set up', seedErr);
const sw = await sweep();
check(sw.json?.moved?.[ids.stalled] === 'round' && sw.json?.moved?.[ids.idle] === 'round', 'the stalled round and the idle meeting are moved on', sw.json);
check(!(ids.fresh in (sw.json?.moved || {})), 'a round that is still running is left alone', sw.json);
check(sw.json?.moved?.[ids.spent] === 'gave_up', 'a round tried three times is given up', sw.json);
const [ms, mi] = await Promise.all([waitFor(ids.stalled, (m) => ['complete', 'failed'].includes(m.status)), waitFor(ids.idle, (m) => ['complete', 'failed'].includes(m.status))]);
check(ms?.status === 'complete' && mi?.status === 'complete', 'both then run to the end by themselves', [ms?.status, mi?.status]);

console.log('\n== giving up, and trying again');
const spent = await row(ids.spent);
check(spent?.status === 'failed' && /stopped partway/.test(spent?.failure_reason || ''), 'a meeting given up on says so plainly', [spent?.status, spent?.failure_reason]);
const o2 = await call(other.token, 'meetingRun', { action: 'retry', meeting_id: ids.spent });
check(o2.status === 403 || o2.status === 404, "another user can't retry it", o2.status);
const r4 = await call(owner.token, 'meetingRun', { action: 'retry', meeting_id: ids.spent });
const m4 = await waitFor(ids.spent, (m) => m.status === 'complete' || (m.status === 'failed' && !!m.failure_reason));
check(r4.json?.step === 'synthesis' && m4?.status === 'complete' && !m4?.failure_reason, 'the founder tries again and the Chair resolves it', [r4.json, m4?.status, m4?.failure_reason]);
const r5 = await call(owner.token, 'meetingRun', { action: 'retry', meeting_id: ids.spent });
check(r5.status === 409, 'a finished meeting is not run again', r5.status);

// ---- 4. Holes the second check found.
console.log('\n== a meeting the browser makes is never run by the server');
const { data: forged, error: forgeErr } = await owner.c.from('board_meetings').insert({
  company_id: co.id, created_by_id: owner.uid, question: 'free meeting?', status: 'preparing',
  driver: 'server', step_claimed_at: old(10), step_attempts: 1,
}).select('id, driver, step_claimed_at').single();
check(!forgeErr && forged?.driver === 'browser' && forged?.step_claimed_at === null, 'it is reset to a page-run meeting the sweep ignores', forgeErr || forged);

console.log('\n== a stalled Round 1 runs again');
const r1 = crypto.randomUUID();
await admin.from('board_meetings').insert({ ...base, id: r1, independent_responses: [], status: 'preparing', step_claimed_at: old(5), step_attempts: 1, discussion_rounds_completed: 0, updated_at: old(5) });
const swR1 = await sweep();
const mR1 = await waitFor(r1, (m) => ['complete', 'failed'].includes(m.status));
check(swR1.json?.moved?.[r1] === 'round1' && mR1?.status === 'complete' && (mR1?.independent_responses || []).length === 3, 'the sweep reruns Round 1 and the meeting finishes', [swR1.json?.moved?.[r1], mR1?.status]);

console.log('\n== meetings that would loop are stopped');
const loops = { swept: crypto.randomUUID(), refused: crypto.randomUUID() };
await admin.from('board_meetings').insert([
  // Picked up five times already with nothing finishing.
  { ...base, id: loops.swept, status: 'discussion_complete', step_claimed_at: null, step_attempts: 0, sweep_count: 5, discussion_rounds_completed: 3, updated_at: old(1) },
  // A Round 1 its step refuses (no advisors chosen).
  { ...base, id: loops.refused, participant_advisor_ids: null, independent_responses: [], status: 'preparing', step_claimed_at: old(5), step_attempts: 1, sweep_count: 0, discussion_rounds_completed: 0, updated_at: old(5) },
]);
const swL = await sweep();
const [ls, lr] = await Promise.all([waitFor(loops.swept, (m) => m.status === 'failed', 20_000), waitFor(loops.refused, (m) => m.status === 'failed', 20_000)]);
check(swL.json?.moved?.[loops.swept] === 'gave_up' && ls?.status === 'failed', 'a meeting the sweep keeps picking up is given up on', [swL.json?.moved?.[loops.swept], ls?.status]);
check(lr?.status === 'failed' && lr?.failure_reason === 'This meeting has no advisors.', "a step that refuses stops the meeting with its reason", [lr?.status, lr?.failure_reason]);

// The fake data made for this test is removed.
await admin.from('tasks').delete().eq('company_id', co.id);
await admin.from('board_meetings').delete().eq('company_id', co.id);

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
