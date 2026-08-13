import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import AdvisorAvatar from "@/components/AdvisorAvatar";

// Health only renders once there's real activity behind it — otherwise
// it's a number with nothing behind it, exactly the "unearned praise"
// this product's whole positioning argues against. Three completed board
// meetings is the bar; below it, the card says so honestly instead of
// showing a score.
const HEALTH_GATE_MEETINGS = 3;

// Matches the hard cap enforced in ExecutiveTeam.jsx — the row always
// shows this many seats, filled or not, rather than a variable-length
// list with a "+N more" overflow that can never actually trigger.
const MAX_ADVISOR_SEATS = 6;

function healthScore(stats) {
  return Math.min(100, Math.round(40 + (stats.advisors || 0) * 8 + (stats.meetings || 0) * 6 + (stats.decisions || 0) * 6));
}

function HealthRing({ score }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative w-[68px] h-[68px] flex items-center justify-center shrink-0">
      <svg className="w-[68px] h-[68px] -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--brand))" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-base leading-none">{score}</div>
        <div className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground mt-0.5">Health</div>
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="font-display text-xl leading-none">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}

export default function CompanyCard({ company, stats, advisors = [] }) {
  const navigate = useNavigate();
  const score = healthScore(stats);
  const completedMeetings = stats.completedMeetings || 0;
  const healthEarned = completedMeetings >= HEALTH_GATE_MEETINGS;
  const seats = Array.from({ length: MAX_ADVISOR_SEATS }, (_, i) => advisors[i] || null);
  const initials = company.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

  return (
    <button
      onClick={() => navigate(`/company/${company.id}`)}
      className="group w-full text-left bg-card border border-border/60 rounded-3xl p-6 sm:p-7 hover:shadow-elevated hover:border-border hover:-translate-y-1 transition-all duration-300 ease-out relative overflow-hidden"
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          {/* Inverts with the surface rather than carrying its own colour —
              near-black on this card's light surface; the sidebar version
              (CompanyLayout.jsx) is the same pair swapped, white on dark. */}
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 shadow-soft group-hover:scale-105 transition-transform duration-300"
            style={{ background: "hsl(220 8% 10%)", color: "hsl(40 20% 97%)" }}
          >
            <span className="font-display text-lg font-medium">{initials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-2xl leading-tight truncate">{company.name}</h3>
            {company.industry && <p className="text-sm text-muted-foreground mt-0.5 truncate">{company.industry}</p>}
          </div>
        </div>
      </div>

      {company.tagline && <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">{company.tagline}</p>}

      <div className="flex items-end justify-between gap-4 mb-5 pt-1">
        <div className="flex gap-5 flex-wrap">
          <Stat value={stats.advisors || 0} label="Advisors" />
          <Stat value={stats.meetings || 0} label="Meetings" />
          <Stat value={stats.decisions || 0} label="Decisions" />
        </div>
        {healthEarned ? (
          <HealthRing score={score} />
        ) : (
          <p className="text-xs text-muted-foreground text-right max-w-[110px] leading-snug shrink-0">
            Health appears after {HEALTH_GATE_MEETINGS} board meetings
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/50">
          {/* Six seats, always — filled with real advisors, empty tiles for
              the rest, rather than a variable-length list with a "+N more"
              that could never actually trigger once 6 is a hard cap. */}
          <div className="flex items-center gap-1.5 min-w-0">
            {seats.map((a, i) =>
              a ? (
                <AdvisorAvatar key={a.id || i} name={a.name} size="sm" />
              ) : (
                <AdvisorAvatar key={`empty-${i}`} empty size="sm" />
              )
            )}
          </div>
          <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
            Enter
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
    </button>
  );
}