import { base44 } from "@/api/base44Client";
import { CHAIR_SEAT_ORDER } from "@/components/boardroom/BoardroomBanner";

// Advisors who debate in one meeting, besides the Chair, and the fewest a
// debate needs. Match system_limits, which startBoardMeeting enforces.
export const MAX_DEBATERS = 5;
export const MIN_DEBATERS = 3;

// AI seats on a board, the Chair included. A hard cap while pricing and
// packaging are undecided: every advisor turn is a real API call.
export const MAX_AI_ADVISORS = 6;

// What a meeting is, as the engine runs it: Round 1 positions, then up to
// two rounds of discussion (it stops early once nobody moves), then the
// Chair's resolution. The time is measured, not guessed: 16 completed
// meetings, 23 Aug–7 Oct 2026, from convening to the resolution: median
// 2m15s, middle half 1m40s–3m47s, longest 5m08s.
export const MEETING_HINT = "Plain words are fine. Up to three rounds, then a resolution. Usually two to four minutes.";

// Questions a founder can start from when their company has none of its own.
export const SUGGESTED_QUESTIONS = [
  "Should we manufacture in Portugal or Vietnam?",
  "Is now the right time to raise a funding round?",
  "We have three months of runway. What do we stop doing?",
];

// The company's own first-meeting questions from onboarding (personal to
// what the founder told us), or the generic three when there aren't any.
// Generic questions can miss the business entirely ("manufacture in
// Portugal or Vietnam?" for a booking service), so personal ones come first.
export function suggestedQuestionsFor(company) {
  const own = [...new Set((company?.onboarding_plan?.suggested_meetings || [])
    .filter((q) => typeof q === "string" && q.trim())
    .map((q) => q.trim()))]
    .slice(0, 3);
  return own.length ? own : SUGGESTED_QUESTIONS;
}

// Who's seated for a meeting by default: the whole board, up to
// MAX_DEBATERS, without the Chair (she never debates) or people.
export function defaultAttendance(advisors = [], chair = null) {
  return advisors.filter((a) => a.type !== "human" && a.id !== chair?.id).slice(0, MAX_DEBATERS).map((a) => a.id);
}

// "6 attending · 5 debating": the Chair, the seated advisors and any seated
// people attend; only the AI advisors debate.
export function attendanceCounts(advisors = [], attendingIds = [], chair = null) {
  const debating = advisors.filter((a) => a.type !== "human" && a.id !== chair?.id && attendingIds.includes(a.id)).length;
  const people = advisors.filter((a) => a.type === "human" && attendingIds.includes(a.id)).length;
  return { attending: 1 + debating + people, debating };
}

// Fixed for the duration of a meeting — called once when a meeting starts
// so an advisor never jumps seats mid-discussion. The Chair takes the head
// of the table; debaters fill centre-out from there (CHAIR_SEAT_ORDER
// already carries that priority) and fan evenly down both sides.
export function assignChairs(debaters = [], chair = null) {
  const seated = chair ? [chair, ...debaters] : debaters;
  const assignment = {};
  seated.forEach((a, i) => {
    if (i >= CHAIR_SEAT_ORDER.length) return; // more advisors than usable chairs shouldn't happen (cap is 6 of 9)
    assignment[a.name] = CHAIR_SEAT_ORDER[i];
  });
  return assignment;
}

// Every attending advisor is called in every discussion round, so an advisor
// absent from a round is one whose call failed and was dropped server-side.
// The Chair doesn't debate: a Round 1 answer from her (a meeting started
// before she left the debate) doesn't make her expected in later rounds.
export function absenteesByRound(transcript = [], chairName = null) {
  const attending = [...new Set(
    transcript.filter((m) => m.round === 1 && m.advisor_name && m.advisor_name !== chairName).map((m) => m.advisor_name)
  )];
  if (!attending.length) return {};

  const result = {};
  for (const round of [...new Set(transcript.map((m) => m.round))]) {
    if (round === 1) continue;
    const messages = transcript.filter((m) => m.round === round);
    if (messages.every((m) => m.message_type === "founder_message")) continue;
    const spoke = new Set(messages.map((m) => m.advisor_name));
    const missing = attending.filter((name) => !spoke.has(name));
    if (missing.length) result[round] = missing;
  }
  return result;
}

// What a founder sees when a meeting step fails: our own refusals are already
// written in plain English and pass through; server faults, timeouts and
// technical errors become one calm sentence, never provider or database detail.
function meetingErrorMessage(e, fallback) {
  const status = e?.response?.status;
  const serverMessage = e?.response?.data?.error;
  if (status === 401) return "Your session has ended. Please sign in again to continue.";
  // The database only shows someone else's company to an admin, so this
  // refusal (the server's ownership check) is one an admin sees.
  if (status === 403 && (!serverMessage || serverMessage === "Forbidden"))
    return "You're viewing this as an admin; only the owner can hold meetings here.";
  if (status && status < 500 && serverMessage) return serverMessage;
  return fallback;
}

// Where a meeting the server runs (P0) has got to, as the page shows it.
// The page only watches: the server moves the meeting on by itself.
export function meetingPhase(m) {
  switch (m?.status) {
    case "preparing": return "preparing";
    case "independent_complete": return m.awaiting_human_input ? "human_input" : "discussion";
    case "discussing": return "discussion";
    // Sit in: the board has finished its rounds and waits for the founder
    // before the Chair starts.
    case "discussion_complete": return m.waiting_for_founder ? "discussion" : "resolution";
    case "synthesizing": return "resolution";
    case "complete": return "result";
    case "failed": return "failed";
    case "superseded": return "superseded";
    default: return null;
  }
}

// A meeting the server is still running, so reopening it shows it live.
export function isRunningOnServer(m) {
  return m?.driver === "server" && ["preparing", "human_input", "discussion", "resolution"].includes(meetingPhase(m));
}

// Starts a meeting the server runs to the end (P0). It answers at once;
// Round 1 and everything after happen on the server.
export async function startMeeting({ companyId, question, advisorIds, freeAttemptId, meetingId, awaitHumans = false, pace = "quick", turnShape = false, beforeNote = "" }) {
  try {
    const res = await base44.functions.invoke("startBoardMeeting", {
      company_id: companyId, question, advisor_ids: advisorIds,
      server_driven: true, await_humans: awaitHumans, pace,
      // The turn shape, asked for by the owner's switch (?turnShape=1).
      ...(turnShape ? { turn_shape: true } : {}),
      // "Before the board starts": in every advisor's brief before Round 1.
      ...(beforeNote.trim() ? { before_note: beforeNote.trim() } : {}),
      // Chosen here so the live view can follow exactly this meeting while
      // Round 1 forms, before the call returns.
      ...(meetingId ? { meeting_id: meetingId } : {}),
      ...(freeAttemptId ? { attempt_id: freeAttemptId } : {}),
    });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "Your board couldn't start the meeting just now. Please try again in a moment."));
  }
}

// After the founder has typed the human advisors' views, or skipped them.
export async function continueMeeting(meetingId) {
  try {
    const res = await base44.functions.invoke("meetingRun", { action: "continue", meeting_id: meetingId });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "Your board couldn't carry on just now. Please try again in a moment."));
  }
}

// The founder in the room (P1): a note, typing, carry on, decide now, or one
// more round. Each answers at once; the server moves the meeting on.
export async function meetingAction(meetingId, action, extra = {}) {
  try {
    const res = await base44.functions.invoke("meetingRun", { action, meeting_id: meetingId, ...extra });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "That didn't reach the board just now. Please try again."));
  }
}

// What one more round costs, measured: about 8 US cents (14 October 2026).
export const EXTRA_ROUND_USD = 0.08;
export const MAX_EXTRA_ROUNDS = 2;

// What happens to each of the founder's notes: heard in a round, going into
// the next round, or (after the last round) going to the Chair.
export function noteStatus(note, m) {
  const heard = (m?.discussion_transcript || []).find((x) => x.note_id === note.id);
  if (heard) return { label: `Heard in Round ${heard.round}`, done: true };
  if (note.withdrawn_at) return { label: "Withdrawn", done: true };
  // Round 1 is blind: a note sent while it's written goes in at the first stop.
  if (m?.status === "preparing") return { label: "Goes to the board at the first stop", done: false };
  if (m?.decide_now || m?.status === "synthesizing") return { label: "Goes to the Chair", done: false };
  // With the turn shape on, one note goes into each round: a later one waits
  // (while rounds are still to come).
  if (m?.turn_shape && (m.status !== "discussion_complete" || (m.pace === "sit_in" && m.waiting_for_founder && (m.extra_rounds || 0) < MAX_EXTRA_ROUNDS))) {
    const used = new Set((m.discussion_transcript || []).map((x) => x.note_id).filter(Boolean));
    const waiting = (m.founder_notes || []).filter((n) => !used.has(n.id) && !n.withdrawn_at && !n.before_meeting);
    if (waiting.findIndex((n) => n.id === note.id) > 0) return { label: "Waits for the round after your earlier note", done: false };
  }
  // Sit in, at the last stop: carrying on gives it one more round while
  // extra rounds are left.
  if (m?.status === "discussion_complete")
    return m.pace === "sit_in" && m.waiting_for_founder && (m.extra_rounds || 0) < MAX_EXTRA_ROUNDS
      ? { label: "Goes into one more round", done: false } : { label: "Goes to the Chair", done: false };
  return { label: "Goes into the next round", done: false };
}

// A meeting that stopped: ask the Chair for the resolution again.
export async function retryMeeting(meetingId) {
  try {
    const res = await base44.functions.invoke("meetingRun", { action: "retry", meeting_id: meetingId });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "Your board couldn't pick this meeting up again. Please ask the question again."));
  }
}

// Fire-and-forget: a decision without an embedding is simply invisible to
// relevance search until the backfill picks it up, which must not block or
// fail the flow that recorded it.
export function embedDecisionInBackground(decisionId) {
  if (!decisionId) return;
  base44.functions.invoke("embedDecision", { decision_id: decisionId }).catch(() => {});
}

export async function runFounderFollowup(meetingId, founderMessage) {
  try {
    const res = await base44.functions.invoke("runFounderFollowup", {
      meeting_id: meetingId,
      founder_message: founderMessage,
    });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "Your board couldn't answer just now. Please try again in a moment."));
  }
}
// What the founder told the board before it started ("Before the board
// starts"), shown at the top of the minutes and the full record.
export function beforeMeetingNote(m) {
  return (m?.founder_notes || []).find((n) => n?.before_meeting && !n.withdrawn_at && n.text) || null;
}
