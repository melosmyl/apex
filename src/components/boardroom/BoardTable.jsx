import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Crown } from "lucide-react";

// Elegant oval boardroom table with the founder at the head and advisors around it.
export default function BoardTable({ advisors, activeName }) {
  const n = advisors.length;
  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-[4/3]">
      <div className="absolute inset-[16%] rounded-[45%] bg-gradient-to-b from-[#6b5540] to-[#4a3a2c] shadow-inner border-4 border-[#5c4a38]" />
      <div className="absolute inset-[19%] rounded-[45%] border border-white/10" />

      {/* Founder at head */}
      <Seat pos={{ top: "2%", left: "50%" }} label="You" founder active={activeName === "__founder__"} />

      {advisors.map((a, i) => {
        const angle = (Math.PI * (i + 1)) / (n + 1); // spread around lower arc
        const left = 50 - Math.cos(angle) * 46;
        const top = 30 + Math.sin(angle) * 62;
        return <Seat key={a.id || a.name} pos={{ top: `${top}%`, left: `${left}%` }} advisor={a} active={activeName === a.name} />;
      })}
    </div>
  );
}

function Seat({ pos, advisor, label, founder, active }) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-all duration-300" style={pos}>
      <div className={`rounded-full transition-all duration-300 ${active ? "ring-4 ring-primary/40 scale-110" : ""}`}>
        {founder ? (
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
            <Crown className="w-5 h-5" />
          </div>
        ) : (
          <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="md" />
        )}
      </div>
      <span className={`text-[10px] sm:text-xs font-medium max-w-[80px] truncate text-center ${active ? "text-foreground" : "text-muted-foreground"}`}>
        {founder ? label : advisor.name.split(" ")[0]}
      </span>
    </div>
  );
}