// Workstream P0: the server runs a meeting (driver 'server'). Each step
// (Round 1, one discussion round, the resolution) runs after its request
// has answered, then asks meetingRun to start the next. A sweep restarts a
// step that stalled. The founder's screen only watches the meeting row.
// deno-lint-ignore-file no-explicit-any

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// Matched by the sweep's filter in 20261015100000_p0_server_meeting.sql.
export const STEP_STALE_MS = 4 * 60_000;
export const IDLE_GRACE_MS = 30_000;
export const MAX_STEP_ATTEMPTS = 3;
// Pickups by the sweep with no step finishing in between, before giving up.
export const MAX_SWEEPS = 5;

// Keeps work going after the response has been sent.
export function later(work: Promise<unknown>, label = 'meeting step') {
  const guarded = work.catch((e) => console.error(`${label} failed in the background:`, (e as Error)?.message));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(guarded);
  return guarded;
}

export const isServiceCall = (req: Request) =>
  (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// The meeting's owner, for a step the server runs on their behalf.
export async function meetingOwner(db: any, ownerId: string) {
  const { data, error } = await db.auth.admin.getUserById(ownerId);
  if (error || !data?.user) throw new Error('The meeting owner could not be found.');
  return { id: data.user.id as string, is_anonymous: !!data.user.is_anonymous };
}

// Calls a meeting function as the server. Used by meetingRun to start a step
// and by a step to hand over to meetingRun when it ends.
export function callAsServer(name: string, body: Record<string, unknown>) {
  return fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify(body),
  });
}

// Asks meetingRun to start whatever comes next. Fire and forget: if it
// doesn't arrive, the sweep moves the meeting on within a minute.
export function handOver(meetingId: string) {
  return later(callAsServer('meetingRun', { action: 'advance', meeting_id: meetingId }).then((r) => r.body?.cancel()), 'meeting hand-over');
}

export type Step = 'round1' | 'round' | 'synthesis';

// Sit in: the meeting is at a stop and nothing starts until the founder
// acts. Asking for the decision always wins: a stop written just after the
// founder asked for it (a round finishing at that moment) never holds the
// meeting.
export const waitsForFounder = (m: any) => !!m?.waiting_for_founder && !m?.decide_now;

// What a server-run meeting needs next, or null when nothing should start
// now (a step is running, the founder is being waited for, or it's over).
// `retry` is the founder asking to try a failed meeting again.
export function nextStep(m: any, now = Date.now(), retry = false): Step | null {
  if (!m || m.driver !== 'server') return null;
  const age = (t: string | null) => (t ? now - new Date(t).getTime() : Infinity);
  const claimStale = age(m.step_claimed_at) >= STEP_STALE_MS;
  // Between steps, asking for the decision skips the rounds left.
  const between = m.status === 'independent_complete' ? !m.awaiting_human_input
    : m.status === 'discussing' ? !m.step_claimed_at : false;
  // Sit in: at a stop, nothing starts until the founder acts (Carry on, a
  // note, Decide now or One more round clear it first).
  if ((between || m.status === 'discussion_complete') && waitsForFounder(m)) return null;
  // A step that failed is tried again after a pause, however often the
  // page checks in, so a short outage doesn't use up every try at once.
  const failedAt = m.step_finished_at ? new Date(m.step_finished_at).getTime() : 0;
  if (between && !m.decide_now && (m.step_attempts || 0) > 0 && failedAt && now - failedAt < IDLE_GRACE_MS) return null;
  if (between && m.decide_now) return 'synthesis';
  switch (m.status) {
    case 'preparing':
      return m.step_claimed_at && claimStale ? 'round1' : null;
    case 'independent_complete':
      return m.awaiting_human_input ? null : 'round';
    case 'discussing':
      return !m.step_claimed_at || claimStale ? 'round' : null;
    case 'discussion_complete':
      return 'synthesis';
    case 'synthesizing':
      return age(m.updated_at) >= STEP_STALE_MS ? 'synthesis' : null;
    case 'failed':
      // Only when the founder asks, and only once there's a discussion to
      // resolve: a meeting that never got through Round 1 can't be rescued.
      return retry && (m.independent_responses || []).some((r: any) => !r.unavailable) ? 'synthesis' : null;
    default:
      return null;
  }
}

// Whether the sweep should look at a meeting now (as the cron job's filter):
// a step that stalled, or a meeting that sat between steps for too long.
export function needsSweep(m: any, now = Date.now()) {
  if (!m || m.driver !== 'server') return false;
  const age = (t: string | null) => (t ? now - new Date(t).getTime() : Infinity);
  switch (m.status) {
    case 'preparing': return !!m.step_claimed_at && age(m.step_claimed_at) >= STEP_STALE_MS;
    case 'independent_complete': return !m.awaiting_human_input && !waitsForFounder(m) && age(m.updated_at) >= IDLE_GRACE_MS;
    case 'discussing': return m.step_claimed_at ? age(m.step_claimed_at) >= STEP_STALE_MS : !waitsForFounder(m) && age(m.updated_at) >= IDLE_GRACE_MS;
    case 'discussion_complete': return !waitsForFounder(m) && age(m.updated_at) >= IDLE_GRACE_MS;
    case 'synthesizing': return age(m.updated_at) >= STEP_STALE_MS;
    default: return false;
  }
}

export const STEP_FUNCTION: Record<Step, string> = {
  round1: 'startBoardMeeting',
  round: 'runBoardDiscussion',
  synthesis: 'runChairSynthesis',
};

export const GAVE_UP = 'The board stopped partway through this meeting. Please ask the question again.';

// ---- P1: the founder in the room --------------------------------------
// The pace a meeting runs at (owner, 15 October 2026). Join isn't built yet.
export const PACES = ['quick', 'sit_in'];
export const MAX_NOTES = 6;
export const NOTE_LIMIT = 2000;
export const MAX_EXTRA_ROUNDS = 2;
// The founder's notes no round has taken in yet (a note is taken when it
// appears in the transcript, by id).
export function unusedNotes(m: any) {
  const used = new Set((m?.discussion_transcript || []).map((x: any) => x.note_id).filter(Boolean));
  return (m?.founder_notes || []).filter((n: any) => !used.has(n.id));
}

// How many rounds this meeting runs to: the usual, or the target the
// founder set by asking for one more.
export const roundsFor = (baseRounds: number, m: any) => (Number.isInteger(m?.rounds_target) && m.rounds_target > 0 ? m.rounds_target : baseRounds);

// The new target when the founder asks for one more round: one past the
// plan, or one past where a discussion that settled early stopped.
export function nextTarget(baseRounds: number, m: any) {
  const done = Math.max(1, m?.discussion_rounds_completed || 0);
  if (m?.status === 'discussion_complete') return done + 1;
  return Math.max(roundsFor(baseRounds, m), done) + 1;
}

// Who has the challenge duty in a discussion round: it rotates, starting
// with the board's Contrarian (or another sceptic) when one is seated.
export function challengerFor(advisors: any[], round: number) {
  if (!advisors?.length) return null;
  const sceptic = advisors.findIndex((a) => a.library_key === 'contrarian' || /contrarian|sceptic|skeptic|devil/i.test(`${a.role || ''}`));
  const start = sceptic >= 0 ? sceptic : 0;
  return advisors[(start + Math.max(0, round - 2)) % advisors.length];
}
