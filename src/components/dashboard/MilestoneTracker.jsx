import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Check, MapPin, Sparkles } from "lucide-react";
import { getJourney } from "@/lib/companyJourney";

export default function MilestoneTracker({ company, companyId, onUpdate }) {
  const journey = getJourney(company?.recommended_journey || company?.stage || "idea_validation");
  const completedMilestones = company?.milestone_progress || [];
  const [updating, setUpdating] = useState(null);

  const toggleMilestone = async (milestone) => {
    const isDone = completedMilestones.includes(milestone);
    const next = isDone
      ? completedMilestones.filter((m) => m !== milestone)
      : [...completedMilestones, milestone];

    setUpdating(milestone);
    try {
      const updated = await base44.entities.Company.update(companyId, { milestone_progress: next });
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      // silently fail — non-critical
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = completedMilestones.length;
  const total = journey.milestones.length;
  const pct = total ? Math.round((completedCount / total) * 100) : 0;

  // Find the next incomplete milestone
  const nextMilestone = journey.milestones.find((m) => !completedMilestones.includes(m));

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <MapPin className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
          <h3 className="font-display text-lg">Journey milestones</h3>
        </div>
        <span className="text-xs text-muted-foreground">{journey.label}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{journey.description}</p>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-display text-sm text-muted-foreground tabular-nums">{completedCount}/{total}</span>
      </div>

      {/* Milestones list */}
      <div className="space-y-1">
        {journey.milestones.map((milestone, i) => {
          const isDone = completedMilestones.includes(milestone);
          const isNext = milestone === nextMilestone && !isDone;
          const isUpdating = updating === milestone;
          return (
            <button
              key={i}
              onClick={() => toggleMilestone(milestone)}
              disabled={isUpdating}
              className="flex items-center gap-3 w-full text-left rounded-lg px-2.5 py-2 hover:bg-accent/40 transition-colors group"
            >
              <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${isDone ? "border-brand bg-brand" : "border-border group-hover:border-brand/50"} ${isUpdating ? "opacity-50 animate-pulse" : ""}`}>
                {isDone && <Check className="w-3 h-3 text-brand-foreground" strokeWidth={3} />}
              </span>
              <span className={`text-sm flex-1 transition-colors ${isDone ? "line-through text-muted-foreground/60" : "text-foreground"}`}>
                {milestone}
              </span>
              {isNext && (
                <span className="inline-flex items-center gap-1 text-[10px] text-brand bg-brand-soft rounded-full px-2 py-0.5">
                  <Sparkles className="w-2.5 h-2.5" /> Next
                </span>
              )}
            </button>
          );
        })}
      </div>

      {pct === 100 && (
        <div className="mt-4 text-center text-sm text-brand font-medium">
          🎉 All milestones complete — consider advancing to the next journey stage.
        </div>
      )}
    </div>
  );
}