import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { portraitFor } from "@/lib/portraits";
import { initialsOf } from "@/lib/advisorLibrary";
import { findChair } from "@/lib/chair";
import { MAX_AI_ADVISORS } from "@/lib/boardroom";

// Health only renders once there's real activity behind it — otherwise
// it's a number with nothing behind it, exactly the "unearned praise"
// this product's whole positioning argues against. Three completed board
// meetings is the bar; below it, the card says so honestly instead of
// showing a score.
const HEALTH_GATE_MEETINGS = 3;

// The AI seats on a board (the Chair included), as ExecutiveTeam caps them.
// People someone invites sit on top of that, so the row shows at most this
// many coins and counts any beyond them.
const MAX_ADVISOR_SEATS = MAX_AI_ADVISORS;

// The board as a row of coins: small round portraits with a cream edge
// (a faint ink hairline outside it, so the cream reads against the cream
// card), the Chair first. Spaced with a small gap rather than overlapped:
// at 32px an overlap of a third hid part of every face but the first.
// Custom advisors and people show their initials in the same circle; free
// AI seats are a dashed circle.
const COIN = "w-8 h-8 shrink-0 rounded-full";
const COIN_FRAME = "border-2 border-card shadow-[0_0_0_1px_hsl(var(--foreground)/0.2)]";

function Coin({ advisor }) {
  const [failed, setFailed] = useState(false);
  const p = advisor && !failed ? portraitFor({ libraryKey: advisor.library_key, name: advisor.name }) : null;
  if (!advisor) {
    return <span className={`${COIN} border-[1.5px] border-dashed border-foreground/40`} aria-hidden="true" />;
  }
  return (
    <span
      className={`${COIN} ${COIN_FRAME} overflow-hidden flex items-center justify-center font-mono text-[10px] text-foreground ${p ? "bg-card" : "bg-[hsl(var(--panel))]"}`}
      title={advisor.name}
      role="img"
      aria-label={advisor.name}
    >
      {p ? (
        <img src={p.avatar} srcSet={`${p.avatar} 1x, ${p.avatar2x} 2x`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsOf(advisor.name)}</span>
      )}
    </span>
  );
}

// More members than the row has room for: the last coin counts the rest.
function MoreCoin({ count, names }) {
  return (
    <span className={`${COIN} ${COIN_FRAME} flex items-center justify-center bg-[hsl(var(--panel))] font-mono text-[10px]`} title={names} role="img" aria-label={`and ${count} more: ${names}`}>
      +{count}
    </span>
  );
}

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
  const chair = findChair(advisors);
  // The Chair, then the AI advisors, then any people invited.
  const ordered = [
    ...(chair ? [chair] : []),
    ...advisors.filter((a) => a.type !== "human" && a.id !== chair?.id),
    ...advisors.filter((a) => a.type === "human"),
  ];
  const aiCount = ordered.filter((a) => a.type !== "human").length;
  const freeSeats = Math.max(0, MAX_ADVISOR_SEATS - aiCount);
  const shown = ordered.length > MAX_ADVISOR_SEATS ? ordered.slice(0, MAX_ADVISOR_SEATS - 1) : ordered;
  const hidden = ordered.slice(shown.length);
  const empties = Math.max(0, Math.min(freeSeats, MAX_ADVISOR_SEATS - shown.length - (hidden.length ? 1 : 0)));
  const initials = company.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

  return (
    <button
      onClick={() => navigate(`/company/${company.id}`)}
      className="group w-full text-left bg-card border border-border/60 rounded-3xl p-6 sm:p-7 hover:shadow-elevated hover:border-border hover:-translate-y-1 transition-all duration-300 ease-out relative overflow-hidden"
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          {/* The same outlined tile as the sidebar's company mark (CompanyLayout.jsx). */}
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 bg-card text-foreground border-2 border-foreground shadow-[2px_2px_0_hsl(var(--foreground))] group-hover:scale-105 transition-transform duration-300"
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

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-4 border-t border-border/50">
          {/* The board's coins, then its free AI seats. */}
          <div className="flex items-center gap-1 shrink-0">
            {shown.map((a) => <Coin key={a.id} advisor={a} />)}
            {hidden.length > 0 && <MoreCoin count={hidden.length} names={hidden.map((a) => a.name).join(", ")} />}
            {Array.from({ length: empties }, (_, i) => <Coin key={`empty-${i}`} advisor={null} />)}
          </div>
          <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
            Enter
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
    </button>
  );
}