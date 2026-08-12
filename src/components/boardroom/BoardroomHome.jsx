import React, { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Landmark, ArrowRight, ChevronDown, ChevronUp, Zap, MessagesSquare, FileText, ClipboardCheck, Radio } from "lucide-react";
import { MEETING_MODES } from "@/lib/meetingModes";
import { useAssistant } from "@/lib/AssistantContext";

const PROMPTS = [
  "Should we manufacture our products in Portugal or Vietnam?",
  "Is now the right time to raise a funding round?",
  "Should we launch a premium tier or stay focused on our core product?",
];

// Every other mode is currently disabled — their backend calls were never
// ported off Base44 (see AGENTS/handoff notes). Shown for discoverability,
// not offered as a working alternative.
const OTHER_MODES = MEETING_MODES.filter((m) => m.key !== "board_debate");
const ICONS = { Zap, MessagesSquare, FileText, ClipboardCheck, Radio };

export default function BoardroomHome({ onStartDebate, companyId }) {
  const [question, setQuestion] = useState("");
  const [confirming, setConfirming] = useState(false);
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

  const submit = () => {
    if (!question.trim()) return;
    setConfirming(true);
  };

  const confirmStart = () => {
    setConfirming(false);
    onStartDebate(question);
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-card border border-border/70 rounded-3xl p-6 sm:p-10 rise-in">
        <div className="flex items-center gap-2.5 mb-4 text-muted-foreground">
          <Landmark className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-mono text-xs uppercase tracking-widest">Board Debate</span>
        </div>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Ask your board anything…"
          className="text-base resize-none bg-background rounded-2xl"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => setQuestion(p)}
              className="text-xs text-muted-foreground bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
        <Button onClick={submit} disabled={!question.trim()} className="w-full mt-5 rounded-full h-11">
          Ask the board <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>

      <div className="mt-4 text-center">
        <button
          onClick={() => setShowOtherModes((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          or choose a different session type
          {showOtherModes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {showOtherModes && (
        <div className="grid sm:grid-cols-2 gap-3 mt-4 rise-in">
          {OTHER_MODES.map((m) => {
            const Icon = ICONS[m.icon];
            return (
              <div
                key={m.key}
                className="text-left p-4 rounded-2xl border border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed"
                title="Coming soon"
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Coming soon</span>
                </div>
                <h4 className="font-display text-sm mb-0.5">{m.label}</h4>
                <p className="text-xs text-muted-foreground">{m.tagline}</p>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Bring your full board in?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This starts a full Board Debate — your advisors respond independently, challenge each other over
            several rounds, then the Chair produces a resolution. It typically takes a few minutes.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirming(false)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={confirmStart} className="rounded-full">
              Start the debate <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
