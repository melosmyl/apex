import React from "react";
import { ADVISOR_LIBRARY, initialsOf } from "@/lib/advisorLibrary";
import LineArtPortrait from "@/components/LineArtPortrait";

const SIZES = { sm: "w-9 h-9 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-lg", xl: "w-24 h-24 text-2xl" };

export default function AdvisorAvatar({ name, accent = "#7a5c3e", photo_url, size = "md", className = "" }) {
  const libraryAdvisor = ADVISOR_LIBRARY.find((a) => a.name === name);
  const ringShadow = libraryAdvisor
    ? `0 0 0 2px #4a90d9, 0 1px 3px rgba(0,0,0,0.08)`
    : photo_url
      ? `0 0 0 1px rgba(0,0,0,0.06)`
      : `0 1px 2px rgba(0,0,0,0.08)`;
  const bg = libraryAdvisor ? "#fff" : photo_url ? undefined : `linear-gradient(145deg, ${accent}, ${accent}cc)`;
  return (
    <div
      className={`${SIZES[size]} ${className} rounded-full flex items-center justify-center font-display font-medium text-white shrink-0 overflow-hidden`}
      style={{ background: bg, boxShadow: ringShadow }}
      title={name}
    >
      {libraryAdvisor ? (
        <LineArtPortrait variant={libraryAdvisor.key} />
      ) : photo_url ? (
        <img src={photo_url} alt={name} className="w-full h-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}