import React, { useEffect, useRef } from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Badge } from "@/components/ui/badge";
import { Gavel, ArrowLeft } from "lucide-react";

const PHASE_LABELS = {
  opening: "Opening",
  initial_positions: "Initial Positions",
  discussion: "Discussion",
  challenge: "Challenge Round",
  rebuttal: "Rebuttal & Refinement",
  resolution: "Resolution",
};

const STANCE_STYLES = {
  agree: { label: "Agree", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disagree: { label: "Disagree", className: "bg-rose-50 text-rose-700 border-rose-200" },
  build: { label: "Builds On", className: "bg-blue-50 text-blue-700 border-blue-200" },
  question: { label: "Question", className: "bg-amber-50 text-amber-700 border-amber-200" },
  answer: { label: "Answer", className: "bg-teal-50 text-teal-700 border-teal-200" },
  challenge: { label: "Challenge", className: "bg-orange-50 text-orange-700 border-orange-200" },
  risk: { label: "Risk", className: "bg-red-50 text-red-700 border-red-200" },
  refine: { label: "Refined", className: "bg-violet-50 text-violet-700 border-violet-200" },
  initial: { label: "Position", className: "bg-slate-50 text-slate-600 border-slate-200" },
};

export default function ConversationView({ transcript, advisors = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!transcript?.length) return null;

  const accentOf = (name) => advisors.find((a) => a.name === name)?.accent || "#7a5c3e";
  let lastPhase = null;

  return (
    <div ref={scrollRef} className="space-y-1 max-h-[600px] overflow-y-auto pr-2">
      {transcript.map((msg) => {
        const showPhaseDivider = msg.phase !== lastPhase;
        lastPhase = msg.phase;

        return (
          <React.Fragment key={msg.sequence}>
            {showPhaseDivider && (
              <div className="flex items-center gap-3 py-4">
                <div className="flex-1 h-px bg-border/60" />
                <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {PHASE_LABELS[msg.phase] || msg.phase}
                </Badge>
                <div className="flex-1 h-px bg-border/60" />
              </div>
            )}
            <MessageBubble msg={msg} accent={accentOf(msg.speaker_name)} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MessageBubble({ msg, accent }) {
  const isChair = msg.speaker_type === "chair";
  const isFounder = msg.speaker_type === "founder";
  const stanceStyle = msg.stance ? STANCE_STYLES[msg.stance] : null;

  if (isChair) {
    return (
      <div className="flex justify-center py-2 rise-in">
        <div className="max-w-2xl bg-secondary/60 rounded-2xl px-5 py-3 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Gavel className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">The Chair</span>
          </div>
          <p className="text-sm text-foreground/80 italic">{msg.message}</p>
        </div>
      </div>
    );
  }

  if (isFounder) {
    return (
      <div className="flex justify-end py-2 rise-in">
        <div className="max-w-md bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium opacity-80">{msg.speaker_name}</span>
            {stanceStyle && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${stanceStyle.className}`}>{stanceStyle.label}</span>
            )}
          </div>
          <p className="text-sm">{msg.message}</p>
          {msg.responds_to && msg.responds_to !== "The board" && (
            <p className="text-[11px] opacity-60 mt-1 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> {msg.responds_to}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Advisor message
  return (
    <div className="flex gap-3 py-2 rise-in">
      <div className="shrink-0 pt-1">
        <AdvisorAvatar name={msg.speaker_name} accent={accent} size="sm" />
      </div>
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-medium">{msg.speaker_name}</span>
          <span className="text-xs text-muted-foreground">{msg.advisor_role}</span>
          {stanceStyle && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${stanceStyle.className}`}>{stanceStyle.label}</span>
          )}
        </div>
        {msg.responds_to && (
          <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> {msg.responds_to}
          </p>
        )}
        <p className="text-sm leading-relaxed bg-card border border-border/50 rounded-2xl rounded-tl-sm px-4 py-2.5">
          {msg.message}
        </p>
      </div>
    </div>
  );
}