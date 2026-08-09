import React from "react";
import { Check, Blocks } from "lucide-react";

// Distinct from MilestoneTracker: that's a manual, self-reported checklist
// the founder ticks themselves (orientation — "where you're going"). This is
// computed automatically from real rows in the database, never toggleable
// (record — "what's actually happened"). Each module is a plain yes/no fact,
// not an invented proxy for something unmeasurable.
const MODULES = [
  { key: "board_assembled", label: "Board assembled", test: (d) => d.aiAdvisorCount >= 3 },
  { key: "first_debate", label: "First board debate held", test: (d) => d.completedMeetings >= 1 },
  { key: "first_decision", label: "First decision recorded", test: (d) => d.decisions >= 1 },
  { key: "first_document", label: "First document generated", test: (d) => d.documents >= 1 },
  { key: "first_commitment_closed", label: "First commitment followed through", test: (d) => d.commitmentsClosed >= 1 },
];

export default function BuildStateWidget({ advisors = [], meetings = [], decisions = [], docs = [], tasks = [] }) {
  const data = {
    aiAdvisorCount: advisors.filter((a) => a.type !== "human").length,
    completedMeetings: meetings.filter((m) => m.status === "complete").length,
    decisions: decisions.length,
    documents: docs.length,
    commitmentsClosed: tasks.filter((t) => t.source_meeting_id && t.status === "done").length,
  };

  const completed = MODULES.filter((m) => m.test(data));
  const completedCount = completed.length;
  const total = MODULES.length;
  const pct = Math.round((completedCount / total) * 100);

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <Blocks className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
          <h3 className="font-display text-lg">Build state</h3>
        </div>
        <span className="text-xs text-muted-foreground">What's actually happened</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Computed from your real activity — nothing here is self-reported.</p>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-display text-sm text-muted-foreground tabular-nums">{completedCount}/{total}</span>
      </div>

      <div className="space-y-1">
        {MODULES.map((m) => {
          const isDone = m.test(data);
          return (
            <div key={m.key} className="flex items-center gap-3 px-2.5 py-2">
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isDone ? "border-brand bg-brand" : "border-border"}`}>
                {isDone && <Check className="w-3 h-3 text-brand-foreground" strokeWidth={3} />}
              </span>
              <span className={`text-sm flex-1 ${isDone ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
