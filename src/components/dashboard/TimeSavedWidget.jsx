import React from "react";
import { Clock } from "lucide-react";
import { formatTimeSaved } from "@/lib/momentum";

export default function TimeSavedWidget({ minutes }) {
  const formatted = formatTimeSaved(minutes);

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in h-full">
      <div className="flex items-center gap-2.5 mb-4">
        <Clock className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-lg">Time saved</h3>
      </div>

      <div className="font-display text-3xl mb-1">{formatted}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Estimated time your advisory team has saved you vs. doing this work alone — meetings, decisions, deliverables, and research.
      </p>

      {minutes > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
          That's roughly <span className="font-medium text-foreground">{Math.round(minutes / 60)} hours</span> of executive work offloaded.
        </div>
      )}
    </div>
  );
}