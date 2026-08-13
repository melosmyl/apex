import { base44 } from "@/api/base44Client";
import { CHAIR_SEAT_ORDER } from "@/components/boardroom/BoardroomBanner";

// Fixed for the duration of a meeting — called once when a meeting starts
// so an advisor never jumps seats mid-discussion. Fills centre-out
// (CHAIR_SEAT_ORDER already carries that priority) so 3 advisors sit at
// the head of the table and 6 fan evenly down both sides.
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

export async function startMeeting({ companyId, question, advisorIds }) {
  try {
    const res = await base44.functions.invoke("startBoardMeeting", {
      company_id: companyId, question, advisor_ids: advisorIds,
    });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(e.response?.data?.error || e.message || "Failed to start the meeting.");
  }
}

export async function runDiscussion(meetingId) {
  try {
    const res = await base44.functions.invoke("runBoardDiscussion", { meeting_id: meetingId });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(e.response?.data?.error || e.message || "Board discussion failed.");
  }
}

export async function runResolution(meetingId) {
  try {
    const res = await base44.functions.invoke("runChairSynthesis", { meeting_id: meetingId });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(e.response?.data?.error || e.message || "Resolution failed.");
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
    throw new Error(e.response?.data?.error || e.message || "Follow-up failed.");
  }
}