import { base44 } from "@/api/base44Client";
import { CHAIR_SEAT_ORDER } from "@/components/boardroom/BoardroomBanner";

// Fixed for the duration of a meeting — called once when a meeting starts
// so an advisor never jumps seats mid-discussion. Fills centre-out
// (CHAIR_SEAT_ORDER already carries that priority) so 3 advisors sit at
// the head of the table and 6 fan evenly down both sides.
// Advisors who debate in one meeting, besides the Chair. Matches
// system_limits.max_advisors_per_meeting, which startBoardMeeting enforces.
export const MAX_DEBATERS = 5;

export function assignChairs(advisors = []) {
  const assignment = {};
  advisors.forEach((a, i) => {
    if (i >= CHAIR_SEAT_ORDER.length) return; // more advisors than usable chairs shouldn't happen (cap is 6 of 9)
    assignment[a.name] = CHAIR_SEAT_ORDER[i];
  });
  return assignment;
}

// Every attending advisor is called in every discussion round, so an advisor
// absent from a round is one whose call failed and was dropped server-side.
export function absenteesByRound(transcript = []) {
  const attending = [...new Set(
    transcript.filter((m) => m.round === 1 && m.advisor_name).map((m) => m.advisor_name)
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