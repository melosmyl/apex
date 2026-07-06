import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Crown } from "lucide-react";

// Elegant oval boardroom table with the founder at the head and advisors around it.
export default function BoardTable({ advisors, activeName, selectedIds = [], onToggle }) {
  const n = advisors.length;
  const isSelected = (a) => selectedIds.includes(a.id);
  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-[4/3]">
      <div className="absolute inset-[16%] rounded-[45%] shadow-inner border-4 border-[#5c4a38]"
        style={{
          backgroundColor: "#6b4e2e",
          backgroundImage: [
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0) 7px)",
            "repeating-linear-gradient(93deg, rgba(255,220,180,0.07) 0px, transparent 9px, rgba(80,50,20,0.10) 18px, transparent 27px)",
            "linear-gradient(112deg, #7a5a34 0%, #5c4225 40%, #6e4f2c 72%, #4f371d 100%)",
          ],
        }} />
      <div className="absolute inset-[19%] rounded-[45%] border border-white/10" />

      {/* Founder at head */}
      <Seat pos={{ top: "2%", left: "50%" }} label="You" founder active={activeName === "__founder__"} />

      {advisors.map((a, i) => {
        const angle = (Math.PI * (i + 1)) / (n + 1); // spread around lower arc
        const left = 50 - Math.cos(angle) * 46;
        const top = 30 + Math.sin(angle) * 62;
        return (
          <Seat key={a.id || a.name} pos={{ top: `${top}%`, left: `${left}%` }} advisor={a}
            active={activeName === a.name} selected={isSelected(a)} onClick={() => onToggle?.(a)} />
        );
      })}
    </div>
  );
}

function Seat({ pos, advisor, label, founder, active, selected = true, onClick }) {
  const dimmed = !founder && !selected;
  return (
    <button type="button" onClick={founder ? undefined : onClick} disabled={founder}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 transition-all duration-300 group disabled:cursor-default"
      style={pos}>
      <div className={`rounded-full transition-all duration-300 ${active ? "ring-4 ring-primary/40 scale-110" : ""} ${dimmed ? "opacity-30 grayscale group-hover:opacity-60" : "group-hover:scale-105"}`}>
        {founder ? (
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
            <Crown className="w-5 h-5" />
          </div>
        ) : (
          <AdvisorAvatar name={advisor.name} accent={advisor.accent} size="md" />
        )}
      </div>
      <span className={`text-[10px] sm:text-xs font-medium max-w-[100px] truncate text-center ${active ? "text-foreground" : dimmed ? "text-muted-foreground" : "text-foreground"}`}>
        {founder ? label : advisor.role}
      </span>
    </button>
  );
}