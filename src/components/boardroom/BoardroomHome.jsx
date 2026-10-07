import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Zap, MessagesSquare, FileText, ClipboardCheck, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEETING_MODES } from "@/lib/meetingModes";
import { useAssistant } from "@/lib/AssistantContext";
import { findChair, chairOrBuiltIn } from "@/lib/chair";
import { Link } from "react-router-dom";
import { MAX_DEBATERS, MIN_DEBATERS, MAX_AI_ADVISORS, MEETING_HINT, SUGGESTED_QUESTIONS } from "@/lib/boardroom";
import BoardTable from "@/components/boardroom/BoardTable";
import LastMeetingStrip from "@/components/boardroom/LastMeetingStrip";

// The Boardroom's front page (Workstream L, from the boardroom mock): who's
// at the table, with attending/benched on each seat; the question box with
// suggestions; and the last meeting. Convening goes straight in with the
// seats as set here (the owner replaced the "Bring your full board in?"
// dialog with the toggles).

// Every other mode is currently disabled — their backend calls were never
// ported off Base44 (see AGENTS/handoff notes). Shown for discoverability,
// not offered as a working alternative.
const OTHER_MODES = MEETING_MODES.filter((m) => m.key !== "board_debate");
const ICONS = { Zap, MessagesSquare, FileText, ClipboardCheck, Radio };

export default function BoardroomHome({ companyId, advisors, attendingIds, onAttendingChange, onStartDebate }) {
  const [question, setQuestion] = useState("");
  const [showOtherModes, setShowOtherModes] = useState(false);

  // Resurfacing's real trigger point: this is where a founder actually
  // composes their question in the normal flow (BoardDebate's own idle
  // textarea only sees typing on the rarer "New question" follow-up path).
  // Debounced, never a timer — see BoardDebate.jsx for the matching effect.
  const { checkNoteRelevance, interjection } = useAssistant();
  useEffect(() => {
    if (interjection || question.trim().length < 15) return;
    const t = setTimeout(() => checkNoteRelevance(companyId, question), 800);
    return () => clearTimeout(t);
  }, [question, companyId, interjection, checkNoteRelevance]);

  const boardChair = findChair(advisors);
  const chair = chairOrBuiltIn(advisors);
  const aiOthers = useMemo(() => advisors.filter((a) => a.type !== "human" && a.id !== boardChair?.id), [advisors, boardChair]);
  const humans = useMemo(() => advisors.filter((a) => a.type === "human"), [advisors]);
  const aiSeats = advisors.filter((a) => a.type !== "human").length;

  const debating = aiOthers.filter((a) => attendingIds.includes(a.id)).length;
  const enough = debating >= MIN_DEBATERS && debating <= MAX_DEBATERS;

  const toggle = (a) => {
    onAttendingChange(attendingIds.includes(a.id) ? attendingIds.filter((id) => id !== a.id) : [...attendingIds, a.id]);
  };
  const canSeat = (a) => a.type === "human" || debating < MAX_DEBATERS;

  const submit = () => {
    if (!question.trim() || !enough) return;
    onStartDebate(question, attendingIds);
  };

  return (
    <div className="rise-in">
      <BoardTable
        chair={chair}
        advisors={[...aiOthers, ...humans]}
        attendingIds={attendingIds}
        onToggle={toggle}
        canSeat={canSeat}
        emptySeats={Math.max(0, MAX_AI_ADVISORS - aiSeats)}
        teamHref={`/company/${companyId}/team`}
        seatsFilled={aiSeats}
        seatCap={MAX_AI_ADVISORS}
      />

      <section className="mt-8 grid items-start gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="room-card p-5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-brand">
          <label htmlFor="ask-the-room" className="room-mono mb-2 block">Ask the room</label>
          <textarea
            id="ask-the-room"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Should we launch a premium tier, or stay focused on the core product?"
            className="block min-h-[110px] w-full resize-y border-0 bg-transparent font-display text-[1.35rem] font-light leading-snug text-foreground outline-none placeholder:italic placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-muted-foreground">
              {enough ? MEETING_HINT : aiOthers.length < MIN_DEBATERS ? (
                <>A debate needs {MIN_DEBATERS} advisors besides the Chair. <Link to={`/company/${companyId}/team`} className="underline underline-offset-2 text-foreground">Invite {MIN_DEBATERS - aiOthers.length} more</Link>.</>
              ) : `Seat at least ${MIN_DEBATERS} advisors besides the Chair to convene.`}
            </span>
            <Button onClick={submit} disabled={!question.trim() || !enough} variant="primary" className="h-12 shrink-0 px-6">
              Convene the board <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <h3 className="mb-3 font-display text-[1.05rem] font-medium">Or start from one of these</h3>
          <div className="space-y-3 pl-3">
            {SUGGESTED_QUESTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setQuestion(p)}
                className="room-bubble room-bubble--tail-left block w-full text-left text-[0.95rem] leading-snug transition-colors hover:bg-card"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      <LastMeetingStrip companyId={companyId} />

      <div className="mt-8 text-center">
        <button
          onClick={() => setShowOtherModes((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          or choose a different session type
          {showOtherModes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {showOtherModes && (
        <div className="rise-in mt-4 grid gap-3 sm:grid-cols-2">
          {OTHER_MODES.map((m) => {
            const Icon = ICONS[m.icon];
            return (
              <div
                key={m.key}
                className="cursor-not-allowed rounded-2xl border border-border/50 bg-secondary/30 p-4 text-left opacity-60"
                title="Coming soon"
              >
                <div className="mb-2 flex items-center justify-between">
                  <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Coming soon</span>
                </div>
                <h4 className="mb-0.5 font-display text-sm">{m.label}</h4>
                <p className="text-xs text-muted-foreground">{m.tagline}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
