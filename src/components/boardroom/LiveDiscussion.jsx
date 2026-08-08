import React, { useEffect, useMemo, useRef } from "react";
import { DiscussionMessage } from "@/components/boardroom/ExecutiveDiscussion";
import { MessageSquare } from "lucide-react";

const PHASE_STATUS = {
  preparing: "Advisors are forming their independent positions…",
  discussion: "The board is debating…",
  resolution: "The Chair is weighing the discussion and preparing the resolution…",
};

export default function LiveDiscussion({ transcript = [], advisors = [], phase }) {
  const scrollRef = useRef(null);

  const accentOf = (name) => advisors.find((a) => a.name === name)?.accent || "#7a5c3e";

  const rounds = useMemo(
    () => [...new Set(transcript.map((m) => m.round))].sort((a, b) => a - b),
    [transcript]
  );

  const stats = useMemo(() => {
    const challenges = transcript.filter((m) => ["challenge", "rebuttal"].includes(m.message_type)).length;
    const changed = transcript.filter((m) => m.changed_opinion).length;
    return { challenges, changed };
  }, [transcript]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length]);

  if (!transcript.length) return null;

  const latestRound = rounds[rounds.length - 1];

  return (
    <div className="bg-card border border-border/70 rounded-2xl overflow-hidden rise-in">
      <div className="flex items-center gap-3 p-5 border-b border-border/50">
        <MessageSquare className="w-5 h-5 text-muted-foreground" />
        <div>
          <h3 className="font-display text-lg">Executive Discussion</h3>
          <p className="text-xs text-muted-foreground">
            {rounds.length} {rounds.length === 1 ? "round" : "rounds"} so far · {transcript.length} messages
            {stats.challenges > 0 && ` · ${stats.challenges} challenges`}
            {stats.changed > 0 && ` · ${stats.changed} opinions changed`}
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="p-4 space-y-1 max-h-[600px] overflow-y-auto scroll-smooth">
        {rounds.map((round) => {
          const roundMessages = transcript.filter((m) => m.round === round);
          return (
            <div key={round}>
              <div className="flex items-center gap-3 my-4">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {round === 1 ? "Round 1 — Independent Positions" : `Round ${round} — Discussion`}
                </div>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <div className="space-y-5">
                {roundMessages.map((msg, i) => (
                  <DiscussionMessage key={`${round}-${i}`} msg={msg} accent={accentOf(msg.advisor_name)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {phase !== "result" && (
        <div className="flex items-center gap-2.5 px-5 py-4 border-t border-border/50 bg-secondary/30">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <p className="text-sm text-muted-foreground">
            {phase === "discussion" && latestRound > 1
              ? `Round ${latestRound} complete — the board is continuing…`
              : PHASE_STATUS[phase]}
          </p>
        </div>
      )}
    </div>
  );
}
