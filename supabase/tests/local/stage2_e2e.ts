// Phase 1b Stage 2, end to end on the local stack against fake providers ($0):
// the Chair opens and resolves, and never debates. Setup as in README.md.
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
await fetch(`${FAKE}/__script`, { method: 'POST', body: '{}' });

const email = `chair-${tag}@example.test`, password = crypto.randomUUID();
await admin.auth.admin.createUser({ email, password, email_confirm: true });
const F = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: session } = await F.auth.signInWithPassword({ email, password });
const uid = session.user!.id, token = session.session!.access_token;
const fn = async (name: string, body: unknown) => {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};

async function board(label: string, members: Record<string, unknown>[]) {
  const { data: co } = await F.from('companies').insert({ name: `${label} ${tag}`, created_by_id: uid }).select().single();
  const { data: advs } = await F.from('advisors').insert(members.map((m, i) => ({
    company_id: co.id, created_by_id: uid, type: 'ai', role: 'Advisor', name: `${label} ${i} ${tag}`,
    default_provider: i % 2 ? 'openai' : 'anthropic', default_model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5',
    fallback_provider: i % 2 ? 'anthropic' : 'openai', fallback_model: i % 2 ? 'claude-sonnet-5' : 'gpt-4o', ...m,
  }))).select();
  return { co, advs: advs! };
}
const usage = (meetingId: string) => rows(`select request_type, advisor_id, model from ai_usage_logs where meeting_id='${meetingId}' order by created_at`);

// ---- 1. A board with a Chair; the browser sends her id along with the debaters'.
console.log('\n== board with a Chair');
const A = await board('withchair', [{ library_key: 'chair', role: 'The Chair', name: `Margaret ${tag}` }, {}, {}, {}]);
const chair = A.advs.find((a: any) => a.library_key === 'chair');
const debaters = A.advs.filter((a: any) => a.id !== chair.id);
const s1 = await fn('startBoardMeeting', { company_id: A.co.id, question: 'Should we raise now?', advisor_ids: A.advs.map((a: any) => a.id) });
check(s1.status === 200, 'meeting starts with the Chair in the ids', s1.json);
check(s1.json?.independent_responses?.length === 3 && !s1.json.independent_responses.some((r: any) => r.advisor_id === chair.id), 'Round 1 is the 3 debaters, not the Chair');
check(s1.json?.advisor_names?.length === 3 && !s1.json.advisor_names.includes(chair.name), 'she is not a participant');
check(typeof s1.json?.chair_opening === 'string' && s1.json.chair_opening.length > 0, 'a first meeting has an opening');
const d1 = await fn('runBoardDiscussion', { meeting_id: s1.json?.meeting_id });
check(d1.status === 200 && !d1.json.discussion_transcript.some((m: any) => m.advisor_id === chair.id), 'she speaks in no discussion round', d1.json?.discussion_transcript?.map((m: any) => m.advisor_name));
const r1 = await fn('runChairSynthesis', { meeting_id: s1.json?.meeting_id });
check(r1.json?.status === 'complete', 'the resolution is written');
const u1 = await usage(s1.json?.meeting_id);
check(u1.filter((u: any) => u.advisor_id === chair.id).map((u: any) => u.request_type).sort().join() === 'chair_opening,chair_synthesis', 'her only calls are the opening and the resolution', u1);
const p1 = await rows(`select participants, participant_advisor_ids from board_meetings where id='${s1.json?.meeting_id}'`);
check(!p1[0].participant_advisor_ids.includes(chair.id), 'the stored participants leave her out');
const f1 = await fn('runFounderFollowup', { meeting_id: s1.json?.meeting_id, founder_message: 'What about the risks?' });
const lastRound = Math.max(...(f1.json?.discussion_transcript || []).map((m: any) => m.round));
const replies = (f1.json?.discussion_transcript || []).filter((m: any) => m.round === lastRound && m.message_type !== 'founder_message');
check(f1.status === 200 && replies.length === 3 && !replies.some((m: any) => m.advisor_id === chair.id), 'a follow-up is answered by the debaters only', f1.json);

// ---- 2. Minimum and maximum count debaters only.
console.log('\n== limits');
const few = await fn('startBoardMeeting', { company_id: A.co.id, question: 'q', advisor_ids: [chair.id, debaters[0].id, debaters[1].id] });
check(few.status === 400 && /at least 3 advisors to debate/.test(few.json?.error), 'the Chair plus 2 is refused in plain words', few.json);
const B = await board('six', [{}, {}, {}, {}, {}, {}]);
const many = await fn('startBoardMeeting', { company_id: B.co.id, question: 'q', advisor_ids: B.advs.map((a: any) => a.id) });
check(many.status === 400 && /at most 5 advisors to debate/.test(many.json?.error), '6 debaters are refused', many.json);

// ---- 3. A board without a Chair gets the built-in one; a human "Chair" is never her.
console.log('\n== board without a Chair');
const C = await board('nochair', [{}, {}, {}, { type: 'human', role: 'Board Chair', name: `Human Chair ${tag}` }]);
const ai = C.advs.filter((a: any) => a.type !== 'human');
const s3 = await fn('startBoardMeeting', { company_id: C.co.id, question: 'Hire or wait?', advisor_ids: ai.map((a: any) => a.id) });
check(s3.status === 200 && s3.json?.independent_responses?.length === 3, 'all 3 AI advisors debate');
await fn('runBoardDiscussion', { meeting_id: s3.json?.meeting_id });
const r3 = await fn('runChairSynthesis', { meeting_id: s3.json?.meeting_id });
check(r3.json?.status === 'complete', 'the built-in Chair writes the resolution');
const u3 = await usage(s3.json?.meeting_id);
const chairCalls = u3.filter((u: any) => u.request_type === 'chair_opening' || u.request_type === 'chair_synthesis');
check(chairCalls.length === 2 && chairCalls.every((u: any) => u.advisor_id === null && u.model === 'claude-sonnet-5'), 'opening and resolution come from the built-in Chair, on Claude', chairCalls);

// ---- 4. A meeting started before the change still holds her Round 1 answer.
console.log('\n== meeting already in progress');
const r1entries = A.advs.map((a: any) => ({ advisor_id: a.id, advisor_name: a.name, role: a.role, position: `${a.name} position`, recommendation: `${a.name} recommends`, key_arguments: [], risks: [], confidence_score: 60 }));
const [old] = JSON.parse(await sql(`with i as (insert into board_meetings (company_id, created_by_id, question, status, participants, participant_advisor_ids, independent_responses)
  values ('${A.co.id}', '${uid}', 'Old meeting', 'independent_complete', '${JSON.stringify(A.advs.map((a: any) => a.name))}'::jsonb,
  array[${A.advs.map((a: any) => `'${a.id}'::uuid`).join(',')}], '${JSON.stringify(r1entries).replace(/'/g, "''")}'::jsonb) returning id) select json_agg(i) from i`));
const d4 = await fn('runBoardDiscussion', { meeting_id: old.id });
const t4 = d4.json?.discussion_transcript || [];
check(d4.status === 200 && !t4.some((m: any) => m.advisor_id === chair.id), 'she is dropped from every round, Round 1 included', t4.map((m: any) => [m.round, m.advisor_name]));
const rounds = [...new Set(t4.map((m: any) => m.round))].filter((r) => r !== 1);
check(rounds.every((r) => t4.filter((m: any) => m.round === r).length === 3), 'every debater is present in every round, so no one shows as absent');
const r4 = await fn('runChairSynthesis', { meeting_id: old.id });
check(r4.json?.status === 'complete', 'the old meeting still gets its resolution');

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}`);
Deno.exit(failures ? 1 : 0);
