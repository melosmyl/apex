import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import AssistantWidget from "@/components/assistant/AssistantWidget";
import { base44 } from "@/api/base44Client";
import { checkSessionInterjection } from "@/lib/assistant";

const AssistantContext = createContext(null);

// Safe no-op outside AssistantProvider, same reasoning as usePin()'s
// NOOP_PIN_CONTEXT — anything that calls this before the provider mounts
// (or in a tree that never mounts it) shouldn't crash on destructure.
const NOOP_ASSISTANT_CONTEXT = { meetingRunning: false, setMeetingRunning: () => {}, checkNoteRelevance: async () => {}, checkSession: async () => {} };

export function useAssistant() {
  return useContext(AssistantContext) || NOOP_ASSISTANT_CONTEXT;
}

// Mounted in ProtectedRoute, alongside ProviderHealthBanner — high enough
// in the tree that BoardDebate (nested under CompanyLayout/Boardroom) can
// still reach it via useAssistant() to report when a meeting is running,
// which is what lets the widget below fully suppress itself, and to check
// whether a captured note is relevant to what the founder is typing.
export function AssistantProvider({ children }) {
  const [meetingRunning, setMeetingRunning] = useState(false);
  const [interjection, setInterjection] = useState(null);
  const sessionCheckedFor = useRef(null);

  // Called only from BoardDebate's idle-phase question textarea, debounced
  // there — never on a timer, never on page load. The per-user-per-day
  // budget (shared across resurfacing/accountability/welcome-back) is
  // enforced server-side in checkNoteRelevance itself, before any LLM call.
  const checkNoteRelevance = useCallback(async (companyId, draftText) => {
    try {
      const { data } = await base44.functions.invoke("checkNoteRelevance", { company_id: companyId, draft_text: draftText });
      if (data?.matched) setInterjection({ type: "resurfacing", noteId: data.note_id, text: data.interjection_text });
    } catch {
      // A dropped relevance check is cosmetic — the founder's typing continues regardless.
    }
  }, []);

  // Priority welcome-back > accountability chase > note resurfacing: called
  // once per company landed on (see AssistantWidget), ahead of anything
  // resurfacing-related, which only ever fires later off the founder's own
  // typing. Guarded so a remount (e.g. navigating between company pages)
  // doesn't re-check the same company twice in one browser session.
  const checkSession = useCallback(async (companyId) => {
    if (!companyId || sessionCheckedFor.current === companyId) return;
    sessionCheckedFor.current = companyId;
    const hit = await checkSessionInterjection(companyId).catch(() => null);
    if (hit) setInterjection(hit);
  }, []);

  const dismissInterjection = useCallback(() => setInterjection(null), []);

  return (
    <AssistantContext.Provider value={{ meetingRunning, setMeetingRunning, interjection, checkNoteRelevance, checkSession, dismissInterjection }}>
      {children}
      <AssistantWidget meetingRunning={meetingRunning} interjection={interjection} dismissInterjection={dismissInterjection} />
    </AssistantContext.Provider>
  );
}
