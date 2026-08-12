import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import AdvisorAvatar from "@/components/AdvisorAvatar";

const STATUS_TIERS = [
  { min: 80, label: "Excellent", ring: "hsl(150 45% 38%)", chip: "hsl(150 40% 92%)", chipText: "hsl(150 40% 28%)" },
  { min: 60, label: "Strong", ring: "hsl(150 35% 42%)", chip: "hsl(150 30% 92%)", chipText: "hsl(150 30% 30%)" },
  { min: 40, label: "Stable", ring: "hsl(var(--brand))", chip: "hsl(var(--brand-soft))", chipText: "hsl(38 50% 32%)" },
  { min: 0, label: "Early days", ring: "hsl(30 8% 50%)", chip: "hsl(38 15% 92%)", chipText: "hsl(30 8% 40%)" },
];

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, hsl(40 65% 55%), hsl(28 60% 48%))",
  "linear-gradient(135deg, hsl(150 40% 42%), hsl(160 38% 32%))",
  "linear-gradient(135deg, hsl(200 55% 50%), hsl(215 50% 42%))",
  "linear-gradient(135deg, hsl(340 55% 52%), hsl(350 50% 45%))",
  "linear-gradient(135deg, hsl(280 45% 50%), hsl(270 40% 42%))",
  "linear-gradient(135deg, hsl(60 55% 50%), hsl(48 60% 45%))",
];

function healthScore(stats) {
  return Math.min(100, Math.round(40 + (stats.advisors || 0) * 8 + (stats.meetings || 0) * 6 + (stats.decisions || 0) * 6));
}

function tierFor(score) {
  return STATUS_TIERS.find((t) => score >= t.min);
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function HealthRing({ score, tier }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative w-[68px] h-[68px] flex items-center justify-center shrink-0">
      <svg className="w-[68px] h-[68px] -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={tier.ring} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-700 ease-out" />
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
  const tier = tierFor(score);
  const team = advisors.slice(0, 5);
  const extra = Math.max(0, advisors.length - 5);
  const initials = company.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";
  const gradient = AVATAR_GRADIENTS[hashString(company.id || company.name) % AVATAR_GRADIENTS.length];

  return (
    <button
      onClick={() => navigate(`/company/${company.id}`)}
      className="group w-full text-left bg-card border border-border/60 rounded-3xl p-6 sm:p-7 hover:shadow-elevated hover:border-border hover:-translate-y-1 transition-all duration-300 ease-out relative overflow-hidden"
    >
      {/* Top accent bar — appears on hover */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-brand opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-soft group-hover:scale-105 transition-transform duration-300"
            style={{ background: gradient }}
          >
            <span className="font-display text-lg font-medium text-white">{initials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-2xl leading-tight truncate">{company.name}</h3>
            {company.industry && <p className="text-sm text-muted-foreground mt-0.5 truncate">{company.industry}</p>}
          </div>
        </div>
        <div
          className="font-mono px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.12em] font-medium shrink-0"
          style={{ background: tier.chip, color: tier.chipText }}
        >
          {tier.label}
        </div>
      </div>

      {company.tagline && <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">{company.tagline}</p>}

      <div className="flex items-end justify-between gap-4 mb-5 pt-1">
        <div className="flex gap-5 flex-wrap">
          <Stat value={stats.advisors || 0} label="Advisors" />
          <Stat value={stats.meetings || 0} label="Meetings" />
          <Stat value={stats.decisions || 0} label="Decisions" />
        </div>
        <HealthRing score={score} tier={tier} />
      </div>

      {team.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex -space-x-2">
              {team.map((a, i) => (
                <div key={a.id || i} className="ring-2 ring-card rounded-full group-hover:-translate-x-0.5 transition-transform" style={{ transitionDelay: `${i * 30}ms` }}>
                  <AdvisorAvatar name={a.name} accent={a.accent} size="sm" />
                </div>
              ))}
            </div>
            {extra > 0 && <span className="text-xs text-muted-foreground ml-1">+{extra} more</span>}
          </div>
          <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
            Enter
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
      )}
    </button>
  );
}