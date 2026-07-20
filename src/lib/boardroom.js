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