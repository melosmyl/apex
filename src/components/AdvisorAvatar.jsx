import React from "react";
import { initialsOf } from "@/lib/advisorLibrary";

const SIZES = { sm: "w-9 h-9 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg", xl: "w-24 h-24 text-2xl" };

export default function AdvisorAvatar({ name, accent = "#7a5c3e", photo_url, size = "md", className = "" }) {
  return (
    <div
      className={`${SIZES[size]} ${className} rounded-full flex items-center justify-center font-display font-medium text-white shrink-0 shadow-sm overflow-hidden ring-1 ring-black/5`}
      style={photo_url ? undefined : { background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
      title={name}
    >
      {photo_url ? <img src={photo_url} alt={name} className="w-full h-full object-cover" /> : initialsOf(name)}
    </div>
  );
}