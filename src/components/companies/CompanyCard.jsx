import React from "react";
import { useNavigate } from "react-router-dom";
import { Users, Landmark, Scale, ArrowUpRight } from "lucide-react";

export default function CompanyCard({ company, stats }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/company/${company.id}/dashboard`)}
      className="group text-left bg-card border border-border/70 rounded-2xl p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full min-h-[20rem]">
      
      <div className="flex items-start justify-between mb-5">
        <div className="w-14 h-14 rounded-2xl text-primary-foreground flex items-center justify-center font-display text-2xl overflow-hidden bg-[#0e7741]">
          {company.logo_url ? <img src={company.logo_url} alt="" className="w-full h-full object-cover" /> : company.name?.[0]}
        </div>
        <ArrowUpRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 -translate-x-1 transition-all" />
      </div>
      <h3 className="text-xl font-display mb-1">{company.name}</h3>
      <p className="text-sm text-muted-foreground mb-5">{company.industry || "—"}</p>

      {company.priorities?.length > 0 ?
      <div className="mb-5">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Current Priorities</div>
          <p className="text-sm line-clamp-2">{company.priorities.slice(0, 2).join(" · ")}</p>
        </div> :

      <div className="mb-5 flex-1" />
      }

      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border/60 mt-auto">
        <Stat icon={Users} value={stats.advisors} label="Team" />
        <Stat icon={Landmark} value={stats.meetings} label="Meetings" />
        <Stat icon={Scale} value={stats.decisions} label="Decisions" />
      </div>
    </button>);

}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="text-center">
      <Icon className="w-4 h-4 mx-auto text-muted-foreground mb-1" strokeWidth={1.5} />
      <div className="font-display text-lg leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>);

}