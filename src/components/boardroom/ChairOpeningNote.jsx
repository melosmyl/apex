import React from "react";
import { Gavel } from "lucide-react";

// The Chair's status check at the top of the meeting — what moved since last
// time, and (the one place it's reliable) a direct ask about anything
// overdue. Shown as soon as it's available, before the debate itself starts,
// so it reads as the meeting opening rather than a retrospective summary.
export default function ChairOpeningNote({ chairOpening }) {
  if (!chairOpening) return null;

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-5 rise-in">
      <div className="flex items-center gap-2.5 mb-2">
        <Gavel className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-base">The Chair opens the meeting</h3>
      </div>
      <p className="text-sm leading-relaxed text-foreground/90">{chairOpening}</p>
    </div>
  );
}
