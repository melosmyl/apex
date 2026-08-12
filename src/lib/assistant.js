import { base44, supabase } from "@/api/base44Client";
import { computeStreak, AWAY_AFTER_DAYS } from "@/lib/momentum";

// Fire-and-forget, same reasoning as embedDecisionInBackground: a note
// without an embedding is simply invisible to resurfacing until backfill
// picks it up, which must not block or fail capture.
function embedNoteInBackground(noteId) {
  if (!noteId) return;
  base44.functions.invoke("embedNote", { note_id: noteId }).catch(() => {});
}

// Fire-and-forget tagging/classification (Phase B) — capture itself must
// never wait on an LLM round trip, so this always runs after the note
// already exists and the founder has already seen their confirmation.
function processNoteInBackground(noteId) {
  if (!noteId) return;
  base44.functions.invoke("processNote", { note_id: noteId }).catch(() => {});
}

// Analytics only — never let a logging failure surface to the founder or
// block the interaction it's describing.
export function logAssistantEvent(eventType, { companyId, noteId, taskId, meetingId } = {}) {
  supabase.auth.getUser().then(({ data }) => {
    const userId = data?.user?.id;
    if (!userId) return;
    return supabase.from("assistant_events").insert({
      user_id: userId, company_id: companyId || null,
      event_type: eventType, note_id: noteId || null, task_id: taskId || null, meeting_id: meetingId || null,
    });
  }).catch(() => {});
}

// Capture is deliberately not an LLM call — the 3-second frictionless
// target can't depend on a round trip. Tagging/classification (Phase B) and
// embedding both run afterward, fire-and-forget, exactly like a decision's
// embedding runs after the decision itself is created.
export async function captureNote(companyId, rawText) {
  const text = (rawText || "").trim();
  if (!text) return null;
  const note = await base44.entities.Note.create({ company_id: companyId, raw_text: text });
  logAssistantEvent("note_captured", { companyId, noteId: note.id });
  embedNoteInBackground(note.id);
  processNoteInBackground(note.id);
  return note;
}

// computeStreak itself is reused completely unchanged (src/lib/momentum.js)
// — same data Dashboard.jsx already fetches, same never-penalize-absence
// semantics. This is the client half of the welcome-back interjection;
// getSessionInterjection (server) owns the shared daily budget and the
// deterministic templated text.
export async function loadGapRecoveryState(companyId) {
  const [decisions, tasks, docs, meetings] = await Promise.all([
    base44.entities.Decision.filter({ company_id: companyId }, "-created_date", 5),
    base44.entities.Task.filter({ company_id: companyId }, "-created_date", 200),
    base44.entities.Document.filter({ company_id: companyId }, "-created_date", 200),
    base44.entities.BoardMeeting.filter({ company_id: companyId }, "-created_date", 200),
  ]);
  const streak = computeStreak(meetings, decisions, tasks, docs);
  return { isAway: streak.daysSinceLastActivity !== null && streak.daysSinceLastActivity >= AWAY_AFTER_DAYS, streak };
}

// Checked once per company page landed on (see AssistantContext) — priority
// welcome-back > accountability chase > note resurfacing is enforced
// server-side (getSessionInterjection decides which one, if any, given the
// shared per-user-per-day budget); this just supplies the gap-recovery
// signal computeStreak already produced.
export async function checkSessionInterjection(companyId) {
  const { isAway, streak } = await loadGapRecoveryState(companyId);
  const { data } = await base44.functions.invoke("getSessionInterjection", {
    company_id: companyId, is_away: isAway, streak_current: streak.current, streak_best: streak.best,
  });
  return data?.type ? { type: data.type, text: data.text } : null;
}
