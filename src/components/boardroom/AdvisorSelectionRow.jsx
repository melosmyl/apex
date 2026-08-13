import React from "react";

// Replaces BoardTable's old click-a-seat-in-the-photo interaction — the
// banner shows who has the floor, nothing else, so attendance toggling
// gets its own plain control instead. Orange marks selection because it's
// state the founder caused, not state the product is announcing.
export default function AdvisorSelectionRow({ advisors, selectedIds, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {advisors.map((a) => {
        const selected = selectedIds.includes(a.id);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onToggle(a)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
              selected
                ? "bg-brand text-brand-foreground border-brand"
                : "bg-card/50 text-muted-foreground border-border hover:border-border/70 hover:text-foreground"
            }`}
          >
            {a.name}
            <span className={selected ? "ml-1.5 text-xs opacity-80" : "ml-1.5 text-xs opacity-60"}>{a.role}</span>
          </button>
        );
      })}
    </div>
  );
}
