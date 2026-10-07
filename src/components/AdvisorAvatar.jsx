import React, { useState } from "react";
import { initialsOf } from "@/lib/advisorLibrary";
import { portraitFor } from "@/lib/portraits";

const SIZES = { xs: "w-6 h-6 text-[10px]", sm: "w-9 h-9 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg", xl: "w-24 h-24 text-2xl" };
// Every size shows the face crop: 96px, with the 192px version for
// high-density screens; the larger sizes always use the 192px one.
const LARGE = new Set(["lg", "xl"]);

// The advisor's portrait when they have one (library advisors, found by key
// or name), otherwise a mat tile with ink mono initials: custom advisors,
// people, and anyone whose portrait isn't in yet. Both get the ink outline
// of the Workstream L style.
// `empty` renders an unfilled seat (a dashed outline, no initials).
export default function AdvisorAvatar({ name, libraryKey, size = "md", empty = false, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (empty) {
    return (
      <div
        className={`${SIZES[size]} ${className} rounded-lg border border-dashed border-border shrink-0`}
        aria-hidden="true"
      />
    );
  }

  const portrait = failed ? null : portraitFor({ libraryKey, name });
  return (
    <div
      className={`${SIZES[size]} ${className} rounded-lg flex items-center justify-center font-mono font-medium shrink-0 overflow-hidden bg-card text-foreground border-foreground ${size === "xs" ? "border" : "border-[1.5px]"}`}
      title={name}
    >
      {portrait ? (
        <img
          src={LARGE.has(size) ? portrait.avatar2x : portrait.avatar}
          srcSet={LARGE.has(size) ? undefined : `${portrait.avatar} 1x, ${portrait.avatar2x} 2x`}
          alt={name || ""}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}
