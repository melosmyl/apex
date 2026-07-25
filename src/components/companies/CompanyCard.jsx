import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { getAdvisorByKey } from "@/lib/advisorLibrary";

const STATUS_TIERS = [
{ min: 80, label: "EXCELLENT", color: "hsl(var(--primary))" },
{ min: 60, label: "STRONG", color: "hsl(var(--chart-2))" },
{ min: 40, label: "STABLE", color: "hsl(var(--chart-4))" },
{ min: 0, label: "EARLY DAYS", color: "hsl(var(--muted-foreground))" }];


function healthScore(stats) {
  return Math.min(100, Math.round(40 + (stats.advisors || 0) * 8 + (stats.meetings || 0) * 6 + (stats.decisions || 0) * 6));
}

function tierFor(score) {
  return STATUS_TIERS.find((t) => score >= t.min);
}

function HealthRing({ score }) {
  const tier = tierFor(score);
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - score / 100 * c;
  return (
    <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={tier.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-sm leading-none">{score}%</div>
        <div className="text-[8px] uppercase tracking-wider text-muted-foreground mt-0.5">Health</div>
      </div>
    </div>);

}

function Stat({ value, label }) {
  return (
    <div>
      <div className="font-display text-2xl font-normal leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-editorial text-muted-foreground mt-1.5 font-medium">{label}</div>
    </div>);

}

export default function CompanyCard({ company, stats, advisors = [] }) {
  const navigate = useNavigate();
  const score = healthScore(stats);
  const tier = tierFor(score);
  const team = advisors.slice(0, 4);
  const extra = Math.max(0, advisors.length - 4);
  const initials = company.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•";

  return (
    <button
      onClick={() => navigate(`/company/${company.id}`)}
      className="w-full text-left bg-card border border-border/50 rounded-[var(--radius)] p-6 sm:p-7 shadow-card card-hover group rise-in"
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
            <span className="font-display text-base font-normal text-muted-foreground">{initials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-xl leading-tight truncate font-normal">{company.name}</h3>
            {company.industry && <p className="text-xs text-muted-foreground mt-1">{company.industry}</p>}
          </div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300 shrink-0" />
      </div>

      {company.tagline && <p className="text-sm text-muted-foreground mb-5 line-clamp-2 leading-relaxed">{company.tagline}</p>}

      <div className="flex items-end justify-between gap-4 mb-5">
        <div className="flex gap-6">
          <Stat value={stats.advisors || 0} label="Advisors" />
          <Stat value={stats.meetings || 0} label="Meetings" />
          <Stat value={stats.decisions || 0} label="Decisions" />
        </div>
        <HealthRing score={score} />
      </div>

      {team.length > 0 && (
        <div className="flex items-center gap-2 pt-4 border-t border-border/50">
          <div className="flex -space-x-2">
            {team.map((a, i) => (
              <div key={a.id || i} className="ring-2 ring-card rounded-full">
                <AdvisorAvatar name={a.name} accent={a.accent} size="sm" />
              </div>
            ))}
          </div>
          {extra > 0 && <span className="text-xs text-muted-foreground ml-1">+{extra} more</span>}
        </div>
      )}
    </button>
  );






































}