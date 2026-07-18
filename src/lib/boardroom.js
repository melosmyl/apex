import { base44 } from "@/api/base44Client";

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

export async function runDiscussionTurn(meetingId, userMessage, addressedTo) {
  try {
    const res = await base44.functions.invoke("runChallengeRound", {
      meeting_id: meetingId,
      user_message: userMessage || null,
      addressed_to: addressedTo || null,
    });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  } catch (e) {
    throw new Error(e.response?.data?.error || e.message || "Discussion turn failed.");
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

// Backward-compatible alias
export const runChallenge = runDiscussionTurn;