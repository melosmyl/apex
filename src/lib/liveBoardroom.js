import { base44 } from "@/api/base44Client";
import { embedDecisionInBackground } from "@/lib/boardroom";

export async function startVoiceSession({ companyId, topic, advisorIds, advisorNames, settings }) {
  const meeting = await base44.entities.BoardMeeting.create({
    company_id: companyId,
    question: topic,
    meeting_mode: "live_conversation",
    participants: advisorNames,
    status: "preparing",
  });

  const session = await base44.entities.VoiceMeetingSession.create({
    meeting_id: meeting.id,
    company_id: companyId,
    meeting_topic: topic,
    selected_advisor_ids: advisorIds,
    status: "active",
    started_at: new Date().toISOString(),
    conversation_mode: settings.autoJoin ? "auto" : "manual",
    allow_natural_joining: settings.autoJoin !== false,
    audio_enabled: true,
    transcript_status: "pending",
    meeting_settings: { ...settings, last_sequence: 0 },
  });

  return { meeting, session };
}

export async function runTurn({ sessionId, companyId, founderMessage, advisorIds, topic, history, settings, directorTargetId, advisorExchangeMode, exchangeTurn }) {
  const res = await base44.functions.invoke("runLiveBoardroomTurn", {
    session_id: sessionId,
    company_id: companyId,
    founder_message: founderMessage,
    selected_advisor_ids: advisorIds,
    meeting_topic: topic,
    conversation_history: history,
    meeting_settings: settings,
    director_target_id: directorTargetId || null,
    advisor_exchange_mode: advisorExchangeMode || false,
    exchange_turn: exchangeTurn || 0,
  });
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

export async function endMeeting({ sessionId, companyId }) {
  const res = await base44.functions.invoke("endLiveBoardroom", {
    session_id: sessionId,
    company_id: companyId,
  });
  if (res.data?.error) throw new Error(res.data.error);
  return res.data;
}

export async function loadSessionMessages(sessionId) {
  return await base44.entities.MeetingMessage.filter({ session_id: sessionId }, "sequence_number", 200);
}

export async function resumeSession(sessionId) {
  const session = await base44.entities.VoiceMeetingSession.get(sessionId);
  if (!session) return null;
  const messages = await loadSessionMessages(sessionId);
  return { session, messages };
}

export async function saveMeetingResults({ companyId, sessionId, summary, advisorNames, topic }) {
  const tasks = [];
  if (summary.tasks_and_owners?.length) {
    const created = await base44.entities.Task.bulkCreate(
      summary.tasks_and_owners.map(t => ({
        company_id: companyId,
        title: t.title,
        assigned_to: t.assigned_to || "Unassigned",
        status: "todo",
      }))
    );
    tasks.push(...(Array.isArray(created) ? created : [created]));
  }

  if (summary.suggested_pins?.length) {
    await base44.entities.Pin.bulkCreate(
      summary.suggested_pins.map(p => ({
        company_id: companyId,
        selected_text: p.selected_text,
        source_type: "ai_conversation",
        pin_type: p.pin_type || "Insight",
        summary: p.summary,
        status: "active",
      }))
    );
  }

  const decision = await base44.entities.Decision.create({
    company_id: companyId,
    summary: summary.executive_summary,
    question: topic,
    final_recommendation: (summary.main_recommendations || []).join("; "),
    risks: summary.important_risks || [],
    status: "decided",
    participants: advisorNames,
  });
  embedDecisionInBackground(decision.id);

  return { tasks };
}

export function getAvailableVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
}

export function assignVoicesToAdvisors(advisors, voices) {
  if (!voices.length) return advisors;
  const maleVoices = voices.filter(v => /male|david|alex|daniel|mark|fred|george/i.test(v.name));
  const femaleVoices = voices.filter(v => /female|samantha|zira|karen|moira|victoria|fiona|susan|kate/i.test(v.name));
  const pool = maleVoices.length && femaleVoices.length
    ? [...maleVoices, ...femaleVoices]
    : voices;

  return advisors.map((advisor, i) => {
    if (advisor.voice_name) return advisor;
    const voice = pool[i % pool.length];
    return {
      ...advisor,
      voice_name: voice?.name || null,
      voice_pitch: advisor.voice_pitch || (i % 2 === 0 ? 0.9 : 1.1),
      voice_rate: advisor.voice_rate || 0.97,
    };
  });
}

export function findVoice(voiceName, voices) {
  if (!voiceName) return null;
  return voices.find(v => v.name === voiceName)
    || voices.find(v => v.name.includes(voiceName))
    || null;
}