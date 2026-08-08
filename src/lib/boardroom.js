import { base44 } from "@/api/base44Client";

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