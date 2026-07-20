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

  return null;










































}