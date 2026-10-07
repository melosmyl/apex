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

// Questions a founder can start from.
export const SUGGESTED_QUESTIONS = [
  "Should we manufacture in Portugal or Vietnam?",
  "Is now the right time to raise a funding round?",
  "We have three months of runway. What do we stop doing?",
];

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
  if (status === 403 && (!serverMessage || serverMessage === "Forbidden"))
    return "This company belongs to a different account. Sign in with the account that created it to hold a meeting.";
  if (status && status < 500 && serverMessage) return serverMessage;
  return fallback;
}

export async function startMeeting({ companyId, question, advisorIds, freeAttemptId }) {
  try {
    const res = await base44.functions.invoke("startBoardMeeting", {
      company_id: companyId, question, advisor_ids: advisorIds,
      ...(freeAttemptId ? { attempt_id: freeAttemptId } : {}),
    });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "Your board couldn't start the meeting just now. Please try again in a moment."));
  }
}

export async function runDiscussion(meetingId) {
  try {
    const res = await base44.functions.invoke("runBoardDiscussion", { meeting_id: meetingId });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "Your board couldn't finish the discussion just now. Please try again in a moment."));
  }
}

export async function runResolution(meetingId) {
  try {
    const res = await base44.functions.invoke("runChairSynthesis", { meeting_id: meetingId });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(meetingErrorMessage(e, "The Chair couldn't finish the resolution just now. Please try again in a moment."));
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