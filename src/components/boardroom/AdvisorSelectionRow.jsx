import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { ProfileTrigger } from "@/components/advisors/AdvisorProfilePanel";

// Replaces BoardTable's old click-a-seat-in-the-photo interaction — the
// banner shows who has the floor, nothing else, so attendance toggling
// gets its own plain control instead. Orange marks selection because it's
// state the founder caused, not state the product is announcing.
// The Chair isn't a toggle: she chairs every meeting and never debates, so
// she's shown as a fixed line above the advisors the founder picks from.
// Each advisor's small portrait opens their profile; the rest of the tag
// selects or deselects them.
export default function AdvisorSelectionRow({ advisors, selectedIds, onToggle, chair }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {chair && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground text-center">
          <ProfileTrigger name={chair.name} libraryKey={chair.library_key} advisor={chair.id ? chair : undefined}>
            <AdvisorAvatar name={chair.name} libraryKey={chair.library_key} size="xs" className="rounded-md" />
          </ProfileTrigger>
          <span><span className="font-medium text-foreground">{chair.name}</span> · Chairing: opens and writes the resolution</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2 justify-center">
        {advisors.map((a) => {
          const selected = selectedIds.includes(a.id);
          return (
            <div
              key={a.id}
              className={`inline-flex items-center gap-2 pl-1.5 rounded-lg text-sm font-medium border transition-colors ${
                selected
                  ? "bg-brand text-brand-foreground border-brand"
                  : "bg-card/50 text-muted-foreground border-border hover:border-border/70 hover:text-foreground"
              }`}
            >
              <ProfileTrigger advisor={a} name={a.name} libraryKey={a.library_key}>
                <AdvisorAvatar name={a.name} libraryKey={a.library_key} size="xs" className="rounded-md" />
              </ProfileTrigger>
              <button type="button" onClick={() => onToggle(a)} aria-pressed={selected} className="pr-3.5 py-1.5 text-left">
                {a.name}
                <span className={selected ? "ml-1.5 text-xs opacity-80" : "ml-1.5 text-xs opacity-60"}>{a.role}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
