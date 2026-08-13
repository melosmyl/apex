import React from "react";
import { initialsOf } from "@/lib/advisorLibrary";

const SIZES = { xs: "w-6 h-6 text-[10px]", sm: "w-9 h-9 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg", xl: "w-24 h-24 text-2xl" };

// No illustrated faces, no per-advisor accent colour — a small, sharp-
// cornered, near-black tile with mono initials, same shape language as the
// button/company-tile system. `empty` renders an unfilled seat (a dashed
// outline, no initials) rather than a missing face.
export default function AdvisorAvatar({ name, photo_url, size = "md", empty = false, className = "" }) {
  if (empty) {
    return (
      <div
        className={`${SIZES[size]} ${className} rounded-lg border border-dashed border-border shrink-0`}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={`${SIZES[size]} ${className} rounded-lg flex items-center justify-center font-mono font-medium shrink-0 overflow-hidden`}
      style={{ background: "hsl(220 8% 10%)", color: "hsl(40 20% 97%)" }}
      title={name}
    >
      {photo_url ? (
        <img src={photo_url} alt={name} className="w-full h-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}
