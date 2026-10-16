// meetingRun (Workstream P0): moves a server-run meeting from one step to
// the next. The steps themselves are the meeting functions as before
// (startBoardMeeting's Round 1, runBoardDiscussion one round at a time,
// runChairSynthesis); this only decides which comes next and starts it.
//
//   advance  (service role)   a step that just ended hands over here
//   continue (the founder)    after typing human advisors' views, or skipping
//   retry    (the founder)    a meeting that failed: try the resolution again
//   note     (the founder)    a fact, a question to one advisor, or a challenge
//   carry_on (the founder)    Sit in: the board may go on to the next step
//   decide   (the founder)    no more rounds: the Chair resolves now
//   more     (the founder)    one more round, up to two (not on a free meeting)
//   withdraw (the founder)    a note the board hasn't heard yet never reaches it
//   sweep    (service role)   pg_cron, every minute: meetings nobody moved on
//                             and steps that stalled
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireOwnedRow, accessErrorResponse, checkUserLimit } from '../_shared/access.ts';
import { GAVE_UP, IDLE_GRACE_MS, MAX_EXTRA_ROUNDS, MAX_NOTES, MAX_STEP_ATTEMPTS, MAX_SWEEPS, NOTE_LIMIT, STEP_FUNCTION, STEP_STALE_MS, callAsServer, isServiceCall, later, needsSweep, nextStep, nextTarget, notesInRunningRound, unusedNotes } from '../_shared/meetingDriver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
// Not at a Sit in stop (see waitsForFounder): the sweep never fetches those,
// so a backlog of waiting meetings can't crowd out one that stalled.
const NOT_WAITING = 'or(waiting_for_founder.eq.false,decide_now.eq.true)';
const ACTIVE = ['preparing', 'independent_complete', 'discussing', 'discussion_complete', 'synthesizing'];

const giveUp = (db: any, m: any, reason: string) =>
  db.from('board_meetings').update({ status: 'failed', failure_reason: reason, step_claimed_at: null })
    .eq('id', m.id).eq('status', m.status).eq('step_attempts', m.step_attempts);

// A step that refuses the meeting outright (400, 403) won't do better next
// time: the meeting stops, with the step's own plain reason. Anything else
// (someone else has the step, a gateway or deploy hiccup, a server fault)
// is left for the sweep to try again, within its limits.
async function refused(db: any, m: any, res: Response) {
  if (res.status !== 400 && res.status !== 403) { await res.body?.cancel(); return; }
  const body = await res.json().catch(() => ({}));
  await giveUp(db, m, typeof body?.error === 'string' && body.error.length < 200 ? body.error : GAVE_UP);
}

// A Sit in stop ends: the founder carried on (or did something that does).
// Given the stop the founder's page showed (status and rounds done), only
// that stop ends: a click that arrives late never ends a later one.
function release(db: any, id: string, seen?: any) {
  let q = db.from('board_meetings').update({ waiting_for_founder: false }).eq('id', id);
  if (seen && typeof seen.status === 'string' && Number.isInteger(seen.rounds))
    q = q.eq('status', seen.status).eq('discussion_rounds_completed', seen.rounds);
  return q;
}

// Sit in, once the planned rounds are done: a note gets one more round so
// the board answers it (owner's decision), while extra rounds are left and
// the founder hasn't asked for the decision.
const oneMoreForNote = (m: any, user: any) => m.status === 'discussion_complete' && m.pace === 'sit_in'
  && !user.is_anonymous && !m.decide_now && (m.extra_rounds || 0) < MAX_EXTRA_ROUNDS;

// Exactly one more round: one past the plan, or one past where a discussion
// that just ended stopped (it reopens; the Chair hasn't started). A paid
// step, counted like any other. Ends a Sit in stop.
async function addRound(db: any, user: any, meeting: any, { limitChecked = false } = {}) {
  if (!limitChecked) await checkUserLimit(db, user.id, 'meeting_step');
  const { data: limitsRows } = await db.from('system_limits').select('max_discussion_rounds').order('created_at', { ascending: false }).limit(1);
  const target = nextTarget(limitsRows?.[0]?.max_discussion_rounds || 3, meeting);
  const reopen = meeting.status === 'discussion_complete';
  const { data: more } = await db.from('board_meetings')
    .update({
      extra_rounds: (meeting.extra_rounds || 0) + 1, rounds_target: target, waiting_for_founder: false,
      ...(reopen ? { status: 'discussing', step_finished_at: new Date().toISOString() } : {}),
    })
    .eq('id', meeting.id).eq('status', meeting.status).eq('extra_rounds', meeting.extra_rounds || 0).select('extra_rounds, rounds_target');
  if (!more?.length) return { ok: false };
  return { ok: true, extra_rounds: more[0].extra_rounds, rounds_target: more[0].rounds_target, step: await advance(db, meeting.id) };
}

// Starts what the meeting needs next. A step that has already been tried
// MAX_STEP_ATTEMPTS times, or a meeting the sweep keeps having to pick up,
// isn't tried again: the meeting is marked failed with a plain reason.
async function advance(db: any, meetingId: string, { retry = false, swept = false } = {}) {
  const { data: m } = await db.from('board_meetings').select('*').eq('id', meetingId).maybeSingle();
  const step = nextStep(m, Date.now(), retry);
  if (!step) return null;
  if (retry) {
    await db.from('board_meetings').update({ step_attempts: 0, sweep_count: 0, failure_reason: null }).eq('id', m.id).eq('status', 'failed');
    m.step_attempts = 0;
  } else if (m.step_attempts >= MAX_STEP_ATTEMPTS || (swept && m.sweep_count >= MAX_SWEEPS)) {
    await giveUp(db, m, GAVE_UP);
    return 'gave_up';
  }
  // Asked for the decision between steps: the discussion ends here.
  if (step === 'synthesis' && ['independent_complete', 'discussing'].includes(m.status)) {
    const { data: ended } = await db.from('board_meetings').update({ status: 'discussion_complete', founder_typing_until: null })
      .eq('id', m.id).eq('status', m.status).is('step_claimed_at', null).select('id');
    if (!ended?.length) return null;
  }
  if (swept) await db.from('board_meetings').update({ sweep_count: (m.sweep_count || 0) + 1 }).eq('id', m.id).eq('status', m.status).eq('sweep_count', m.sweep_count || 0);
  later(callAsServer(STEP_FUNCTION[step], { meeting_id: m.id, ...(step === 'round1' ? { action: 'round1' } : {}) })
    .then((res) => refused(db, m, res)), `meeting ${step}`);
  return step;
}

// The cron job's filter (and needsSweep), as a query: only meetings that
// need picking up, oldest first, so a backlog can't hide one.
async function sweep(db: any) {
  const now = Date.now();
  // Anything that moved in the last day: a Sit in meeting can wait for days
  // and carry on later.
  const since = new Date(now - 24 * 60 * 60_000).toISOString();
  const stale = new Date(now - STEP_STALE_MS).toISOString();
  const idle = new Date(now - IDLE_GRACE_MS).toISOString();
  const { data } = await db.from('board_meetings').select('*')
    .eq('driver', 'server').in('status', ACTIVE).gte('updated_at', since)
    .or([
      `and(status.eq.preparing,step_claimed_at.lt.${stale})`,
      `and(status.eq.independent_complete,awaiting_human_input.eq.false,${NOT_WAITING},updated_at.lt.${idle})`,
      `and(status.eq.discussing,step_claimed_at.is.null,${NOT_WAITING},updated_at.lt.${idle})`,
      `and(status.eq.discussing,step_claimed_at.lt.${stale})`,
      `and(status.eq.discussion_complete,${NOT_WAITING},updated_at.lt.${idle})`,
      `and(status.eq.synthesizing,updated_at.lt.${stale})`,
    ].join(','))
    .order('updated_at', { ascending: true }).limit(50);
  const moved: Record<string, string | null> = {};
  for (const m of (data || []).filter((m: any) => needsSweep(m, now))) moved[m.id] = await advance(db, m.id, { swept: true });
  return moved;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const { action, meeting_id } = body || {};

    if (isServiceCall(req)) {
      if (action === 'sweep') return json({ moved: await sweep(db) });
      if (action === 'advance' && meeting_id) return json({ step: await advance(db, meeting_id) });
      return json({ error: 'Unknown action' }, 400);
    }

    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    if (!meeting_id) return json({ error: 'meeting_id is required' }, 400);
    const meeting = await requireOwnedRow(db, 'board_meetings', meeting_id, user.id, '*');
    if (meeting.driver !== 'server') return json({ error: 'This meeting is run by the page, not the server.' }, 409);

    if (action === 'continue') {
      // Only the founder ends the wait for human advisors' views.
      // In Sit in this is also the stop after Round 1: one click goes on.
      await db.from('board_meetings').update({ awaiting_human_input: false, waiting_for_founder: false })
        .eq('id', meeting.id).eq('awaiting_human_input', true);
      return json({ step: await advance(db, meeting.id) });
    }
    const open = ['preparing', 'independent_complete', 'discussing', 'discussion_complete'].includes(meeting.status);

    if (action === 'note') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text) return json({ error: 'Write something first.' }, 400);
      if (text.length > NOTE_LIMIT) return json({ error: `Keep it under ${NOTE_LIMIT} characters.` }, 400);
      if (!open) return json({ error: meeting.status === 'synthesizing' ? 'The Chair is already writing up. Ask the board after the resolution.' : 'This meeting has finished.' }, 409);
      const to = body.to_advisor_id ? String(body.to_advisor_id) : null;
      let toName = null;
      if (to) {
        if (!(meeting.participant_advisor_ids || []).includes(to)) return json({ error: "That advisor isn't in this meeting." }, 400);
        const { data: a } = await db.from('advisors').select('name').eq('id', to).maybeSingle();
        toName = a?.name || null;
      }
      // A note that brings one more round is a paid step: counted before the
      // note is kept, so a refused round never leaves a note behind.
      const oneMore = oneMoreForNote(meeting, user);
      if (oneMore) await checkUserLimit(db, user.id, 'meeting_step');
      const note = { id: crypto.randomUUID(), text, to_advisor_id: to, to_name: toName, at: new Date().toISOString() };
      const { data: added, error } = await db.rpc('append_founder_note', { p_meeting_id: meeting.id, p_note: note, p_max: MAX_NOTES });
      if (error) throw error;
      if (!added) {
        const full = (meeting.founder_notes || []).filter((n: any) => !n.withdrawn_at && !n.before_meeting).length >= MAX_NOTES;
        return json({ error: full ? `You can add up to ${MAX_NOTES} notes in one meeting.` : 'The Chair is already writing up. Ask the board after the resolution.' }, 409);
      }
      // Otherwise, and in a Quick meeting, a note after the last round goes
      // to the Chair.
      if (oneMore) {
        const added = await addRound(db, user, meeting, { limitChecked: true });
        if (added.ok) return json({ note, extra_rounds: added.extra_rounds, step: added.step, answered_in: 'one more round' });
      }
      await release(db, meeting.id);
      return json({ note, step: await advance(db, meeting.id), to_chair: meeting.status === 'discussion_complete' });
    }
    if (action === 'withdraw') {
      // A note the board hasn't heard (owner, 16 October 2026): withdrawn, it
      // never reaches the board, the Chair or a new round. Only while nothing
      // has taken it: not once heard, not while the round now being written
      // has it, not once the Chair is writing.
      const id = typeof body.note_id === 'string' ? body.note_id : '';
      const note = (meeting.founder_notes || []).find((n: any) => n.id === id && !n.before_meeting);
      if (!note) return json({ error: "That note isn't in this meeting." }, 404);
      if (note.withdrawn_at) return json({ withdrawn: true });
      if ((meeting.discussion_transcript || []).some((e: any) => e.note_id === id)) return json({ error: 'The board has already heard it.' }, 409);
      if (!open) return json({ error: meeting.status === 'synthesizing' ? 'The Chair already has it.' : 'This meeting has finished.' }, 409);
      if (notesInRunningRound(meeting).some((n: any) => n.id === id)) return json({ error: 'The board is hearing it in the round being written now.' }, 409);
      const { data: done, error } = await db.rpc('withdraw_founder_note', { p_meeting_id: meeting.id, p_note_id: id, p_status: meeting.status, p_claimed_at: meeting.step_claimed_at });
      if (error) throw error;
      if (!done) return json({ error: 'The meeting moved on just then. Please try again.' }, 409);
      return json({ withdrawn: true });
    }
    if (action === 'carry_on') {
      // A note that arrived while the last round was being written hasn't
      // been answered: carrying on gives it its round, as one sent at the stop.
      if (meeting.waiting_for_founder && unusedNotes(meeting).length && oneMoreForNote(meeting, user)) {
        const added = await addRound(db, user, meeting);
        if (added.ok) return json({ extra_rounds: added.extra_rounds, step: added.step, answered_in: 'one more round' });
      }
      await release(db, meeting.id, body.at);
      return json({ step: await advance(db, meeting.id) });
    }
    if (action === 'decide') {
      if (!open) return json({ error: 'The Chair is already on it.' }, 409);
      await db.from('board_meetings').update({ decide_now: true, waiting_for_founder: false }).eq('id', meeting.id).in('status', ['preparing', 'independent_complete', 'discussing', 'discussion_complete']);
      return json({ step: await advance(db, meeting.id) });
    }
    if (action === 'more') {
      if (user.is_anonymous) return json({ error: 'Create an account to ask for more rounds.' }, 403);
      if (!open || meeting.decide_now) return json({ error: 'The Chair is already on it.' }, 409);
      if ((meeting.extra_rounds || 0) >= MAX_EXTRA_ROUNDS) return json({ error: `A meeting can have up to ${MAX_EXTRA_ROUNDS} extra rounds.` }, 409);
      const added = await addRound(db, user, meeting);
      if (!added.ok) return json({ error: 'The Chair is already on it.' }, 409);
      return json({ extra_rounds: added.extra_rounds, rounds_target: added.rounds_target, step: added.step });
    }
    if (action === 'retry') {
      // Each try is a paid resolution: it counts like any meeting step.
      await checkUserLimit(db, user.id, 'meeting_step');
      const step = await advance(db, meeting.id, { retry: true });
      if (!step) return json({ error: "This meeting can't be picked up again. Please ask the question again." }, 409);
      return json({ step });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    console.error('meetingRun error:', (error as Error).message);
    return json({ error: 'Something went wrong moving the meeting on.' }, 500);
  }
});
