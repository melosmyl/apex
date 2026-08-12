import React from "react";
import { Gauge } from "lucide-react";

function confidenceTier(score) {
  if (score >= 75) return { label: "High confidence", barClass: "bg-brand", textClass: "text-brand" };
  if (score >= 50) return { label: "Moderate confidence", barClass: "bg-brand/60", textClass: "text-brand" };
  return { label: "Low confidence", barClass: "bg-destructive", textClass: "text-destructive" };
}

// The confidence number already appears in the Board Resolution header as a
// glance-value. This is the elaborated read: what that number means, plus the
// two things the board itself flagged as unresolved — a dissenting advisor
// and assumptions the discussion never nailed down. Matches BoardMemoryNote's
// visual language so the two sit as a pair: what informed the answer, and how
// sure the board actually is.
export default function BoardUncertaintyNote({ resolution }) {
  if (!resolution) return null;

  const hasConfidence = typeof resolution.overall_confidence_score === "number";
  const minorityOpinion = resolution.minority_opinion;
  const uncertainAssumptions = resolution.discussion_evaluation?.uncertain_assumptions || [];

  if (!hasConfidence && !minorityOpinion && !uncertainAssumptions.length) return null;

  const score = Math.round(resolution.overall_confidence_score || 0);
  const tier = confidenceTier(score);

  return (
    <div className="bg-secondary/40 border border-border/70 rounded-2xl p-5 rise-in">
      <div className="flex items-center gap-2.5 mb-1">
        <Gauge className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-base">Board uncertainty</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">What the board isn't sure about, alongside how sure it is overall.</p>

      {hasConfidence && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Overall confidence</span>
            <span className={`text-sm font-medium ${tier.textClass}`}>{score}% · {tier.label}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-border/60 overflow-hidden">
            <div className={`h-full rounded-full ${tier.barClass} transition-all`} style={{ width: `${score}%` }} />
          </div>
        </div>
      )}

      {minorityOpinion && (
        <div className="mb-4">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Minority opinion</div>
          <p className="text-sm leading-relaxed italic text-muted-foreground">{minorityOpinion}</p>
        </div>
      )}

      {uncertainAssumptions.length > 0 && (
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Assumptions that remain uncertain</div>
          <ul className="space-y-1.5">
            {uncertainAssumptions.map((a, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground">—</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
