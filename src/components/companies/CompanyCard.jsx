import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { getAdvisorByKey } from "@/lib/advisorLibrary";

const STATUS_TIERS = [
{ min: 80, label: "EXCELLENT", color: "#1B4332" },
{ min: 60, label: "STRONG", color: "#2D6A4F" },
{ min: 40, label: "STABLE", color: "#B5832B" },
{ min: 0, label: "EARLY DAYS", color: "#94918B" }];


function healthScore(stats) {
  return Math.min(100, Math.round(40 + (stats.advisors || 0) * 8 + (stats.meetings || 0) * 6 + (stats.decisions || 0) * 6));
}

function tierFor(score) {
  return STATUS_TIERS.find((t) => score >= t.min);
}

function HealthRing({ score }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - score / 100 * c;
  return (
    <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1B4332" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
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
      <div className="font-display text-2xl font-light leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-1.5">{label}</div>
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
      onClick={() => navigate(`/company/${company.id}/dashboard`)}
      className="group text-left bg-card border border-border/70 rounded-2xl p-5 sm:p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col h-full hidden">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl border border-border flex items-center justify-center font-display text-lg text-foreground bg-secondary/50 shrink-0 overflow-hidden">
            {company.logo_url ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" /> : initials}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-display truncate">{company.name}</h3>
            <p className="text-sm text-muted-foreground truncate">{company.industry || company.tagline || "—"}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: tier.color }} />
              <span className="text-[10px] uppercase tracking-[0.15em] font-medium" style={{ color: tier.color }}>{tier.label}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <HealthRing score={score} />
          <ArrowUpRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">Executive Team</div>
        <div className="flex items-center gap-1.5">
          {team.length > 0 ? team.map((a) => {
            const lib = a.library_key ? getAdvisorByKey(a.library_key) : null;
            return <AdvisorAvatar key={a.id} name={a.name} accent={a.accent || lib?.accent || "#7a5c3e"} photo_url={a.photo_url || lib?.photo_url} size="sm" />;
          }) : <span className="text-sm text-muted-foreground italic">No advisors yet</span>}
          {extra > 0 &&
          <div className="w-9 h-9 rounded-full bg-secondary text-muted-foreground flex items-center justify-center text-xs font-medium border border-border">+{extra}</div>
          }
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/60 mt-auto">
        <Stat value={stats.advisors || 0} label="Advisors" />
        <Stat value={stats.meetings || 0} label="Meetings" />
        <Stat value={stats.decisions || 0} label="Decisions" />
      </div>
    </button>);
}