import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";

// Replaces BoardTable's old click-a-seat-in-the-photo interaction — the
// banner shows who has the floor, nothing else, so attendance toggling
// gets its own plain control instead. Orange marks selection because it's
// state the founder caused, not state the product is announcing.
// The Chair isn't a toggle: she chairs every meeting and never debates, so
// she's shown as a fixed line above the advisors the founder picks from.
export default function AdvisorSelectionRow({ advisors, selectedIds, onToggle, chair }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {chair && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground text-center">
          <AdvisorAvatar name={chair.name} libraryKey={chair.library_key} size="xs" className="rounded-md" />
          <span><span className="font-medium text-foreground">{chair.name}</span> · Chairing: opens and writes the resolution</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2 justify-center">
        {advisors.map((a) => {
          const selected = selectedIds.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onToggle(a)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                selected
                  ? "bg-brand text-brand-foreground border-brand"
                  : "bg-card/50 text-muted-foreground border-border hover:border-border/70 hover:text-foreground"
              }`}
            >
              <AdvisorAvatar name={a.name} libraryKey={a.library_key} size="xs" className="rounded-md" />
              <span>
                {a.name}
                <span className={selected ? "ml-1.5 text-xs opacity-80" : "ml-1.5 text-xs opacity-60"}>{a.role}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
