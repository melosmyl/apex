import React, { useEffect, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import CaptureInput from "@/components/assistant/CaptureInput";
import RoutingPrompt from "@/components/assistant/RoutingPrompt";
import InterjectionBanner from "@/components/assistant/InterjectionBanner";
import { ASSISTANT_NAME } from "@/lib/branding";
import { base44 } from "@/api/base44Client";
import { logAssistantEvent } from "@/lib/assistant";
import { useAssistant } from "@/lib/AssistantContext";

const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

// Mounted once in ProtectedRoute (see AssistantContext.jsx), so it renders
// on every authenticated screen by default — this component is what scopes
// that down to company pages only, and suppresses entirely during a live
// board meeting. useMatch (not useParams) is deliberate: this widget sits
// as a sibling of <Outlet/>, not nested inside the /company/:companyId
// route, so useParams() here would never see companyId — useMatch reads
// the current URL directly regardless of tree position.
export default function AssistantWidget({ meetingRunning, interjection, dismissInterjection }) {
  const match = useMatch("/company/:companyId/*");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [routingNote, setRoutingNote] = useState(null);
  const pollRef = useRef(null);
  const { checkSession } = useAssistant();

  useEffect(() => () => clearTimeout(pollRef.current), []);

  // Priority check (welcome-back > accountability chase), once per company
  // landed on — guarded inside checkSession itself against re-firing for
  // the same company, and skipped entirely during a live meeting.
  useEffect(() => {
    if (match?.params?.companyId && !meetingRunning) checkSession(match.params.companyId);
  }, [match?.params?.companyId, meetingRunning, checkSession]);

  // She may surface a relevant note when context genuinely matches — that's
  // the earned exception to "default state is collapsed and silent," not a
  // contradiction of it. Auto-opening only happens here, in direct response
  // to a real match, never on load or a timer.
  useEffect(() => {
    if (interjection) setOpen(true);
  }, [interjection]);

  const stopPolling = () => { clearTimeout(pollRef.current); pollRef.current = null; };

  // Routing is a direct, synchronous response to what the founder just
  // typed — not a proactive interruption — so it's exempt from the
  // resurfacing/accountability/welcome-back interjection budget (Phase D/E)
  // and only ever checked right after this specific capture, briefly.
  const pollForRouting = (noteId, companyId, attemptsLeft = POLL_ATTEMPTS) => {
    if (attemptsLeft <= 0) return;
    pollRef.current = setTimeout(async () => {
      try {
        const note = await base44.entities.Note.get(noteId);
        if (note.signal_size === "strategic" && note.board_prompt_text) {
          setRoutingNote(note);
          logAssistantEvent("routing_prompt_shown", { companyId, noteId: note.id });
          return;
        }
        if (note.signal_size === "note") return; // classified, not strategic — stop
        pollForRouting(noteId, companyId, attemptsLeft - 1);
      } catch {
        // A dropped poll is cosmetic — the note itself is already saved.
      }
    }, POLL_INTERVAL_MS);
  };

  const onCaptured = (note) => {
    if (!note) return;
    pollForRouting(note.id, note.company_id);
  };

  const acceptRouting = () => {
    if (!routingNote) return;
    logAssistantEvent("routing_accepted", { companyId: routingNote.company_id, noteId: routingNote.id });
    const companyId = routingNote.company_id;
    const presetQuestion = routingNote.raw_text;
    const presetNoteId = routingNote.id;
    setRoutingNote(null);
    setOpen(false);
    navigate(`/company/${companyId}/boardroom`, { state: { presetQuestion, presetNoteId } });
  };

  const dismissRouting = () => setRoutingNote(null);

  const close = () => { setOpen(false); stopPolling(); setRoutingNote(null); };

  if (!match || meetingRunning) return null;
  const companyId = match.params.companyId;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-80 bg-card border border-border/70 rounded-2xl shadow-lg p-4 rise-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-display">{ASSISTANT_NAME}</span>
            <button onClick={close} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <CaptureInput companyId={companyId} onCaptured={onCaptured} />
          {routingNote && (
            <RoutingPrompt promptText={routingNote.board_prompt_text} onAccept={acceptRouting} onDismiss={dismissRouting} />
          )}
          {!routingNote && interjection && (
            <InterjectionBanner text={interjection.text} onDismiss={dismissInterjection} />
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        <Sparkles className="w-5 h-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
