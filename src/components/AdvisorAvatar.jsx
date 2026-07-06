import React from "react";
import { initialsOf } from "@/lib/advisorLibrary";

const SIZES = { sm: "w-9 h-9 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg", xl: "w-24 h-24 text-2xl" };

export default function AdvisorAvatar({ name, accent = "#7a5c3e", size = "md", className = "" }) {
  return (
    <div
      className={`${SIZES[size]} ${className} rounded-full flex items-center justify-center font-display font-medium text-white shrink-0 shadow-sm`}
      style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
    >
      {initialsOf(name)}
    </div>
  );
}