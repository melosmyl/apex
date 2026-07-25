import React, { useEffect, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Scale, Target, CheckSquare, FileText, Landmark, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import ProjectProgress from "@/components/dashboard/ProjectProgress";

function Card({ title, icon: Icon, children, onView }) {
  return (
    <div className="bg-card border border-border/50 rounded-[var(--radius)] p-7 shadow-card rise-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <Icon className="w-[17px] h-[17px] text-muted-foreground" strokeWidth={1.5} />
          <h3 className="font-display text-lg font-normal">{title}</h3>
        </div>
        {onView && <button onClick={onView} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">View all <ArrowRight className="w-3 h-3" /></button>}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ text }) => <p className="text-sm text-muted-foreground py-4">{text}</p>;

export default function Dashboard() {
  const { company } = useOutletContext();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [decisions, tasks, docs, meetings] = await Promise.all([
        base44.entities.Decision.filter({ company_id: companyId }, "-created_date", 5),
        base44.entities.Task.filter({ company_id: companyId }, "-created_date", 6),
        base44.entities.Document.filter({ company_id: companyId }, "-created_date", 5),
        base44.entities.BoardMeeting.filter({ company_id: companyId }, "-created_date", 4),
      ]);
      setData({ decisions, tasks, docs, meetings });
    })();
  }, [companyId]);

  const go = (p) => navigate(`/company/${companyId}/${p}`);
  const openTasks = data?.tasks?.filter((t) => t.status !== "done") || [];

  return (
    <div>
      <div className="mb-12 rise-in">
        <div className="text-[11px] uppercase tracking-editorial text-muted-foreground mb-3 font-medium">Executive Briefing</div>
        <h1 className="text-3xl sm:text-4xl font-display font-light leading-tight">{company.name}</h1>
        {company.tagline && <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">{company.tagline}</p>}
      </div>

      {company.metrics?.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {company.metrics.map((m, i) => {
            const T = m.trend === "up" ? TrendingUp : m.trend === "down" ? TrendingDown : Minus;
            return (
              <div key={i} className="bg-card border border-border/50 rounded-[var(--radius)] p-5 shadow-card rise-in">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">{m.label}</div>
                <div className="flex items-end justify-between">
                  <div className="font-display text-2xl font-normal">{m.value}</div>
                  <T className={`w-4 h-4 ${m.trend === "up" ? "text-chart-2" : m.trend === "down" ? "text-destructive" : "text-muted-foreground"}`} strokeWidth={1.5} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectProgress companyId={companyId} onNavigate={() => go("projects")} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Recent Board Decisions" icon={Scale} onView={() => go("decisions")}>
          {!data ? <Empty text="Loading…" /> : data.decisions.length === 0 ? <Empty text="No decisions recorded yet." /> : (
            <ul className="space-y-3">
              {data.decisions.map((d) => (
                <li key={d.id} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <div><div className="text-sm font-medium leading-snug">{d.question}</div>
                    <div className="text-xs text-muted-foreground">{d.decision_taken || d.final_recommendation || "Pending"}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Current Strategic Priorities" icon={Target} onView={() => go("settings")}>
          {company.priorities?.length ? (
            <ul className="space-y-2.5">
              {company.priorities.map((p, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="font-display text-muted-foreground w-5">{String(i + 1).padStart(2, "0")}</span>{p}
                </li>
              ))}
            </ul>
          ) : <Empty text="Set your priorities in Settings." />}
        </Card>

        <Card title="Open Executive Tasks" icon={CheckSquare} onView={() => go("tasks")}>
          {!data ? <Empty text="Loading…" /> : openTasks.length === 0 ? <Empty text="No open tasks." /> : (
            <ul className="space-y-3">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{t.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{t.assigned_to}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent Documents" icon={FileText} onView={() => go("documents")}>
          {!data ? <Empty text="Loading…" /> : data.docs.length === 0 ? <Empty text="No documents yet." /> : (
            <ul className="space-y-3">
              {data.docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{d.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{d.category}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent Board Meetings" icon={Landmark} onView={() => go("meetings")}>
          {!data ? <Empty text="Loading…" /> : data.meetings.length === 0 ? (
            <Empty text="Convene your first board meeting in the Boardroom." />
          ) : (
            <ul className="space-y-3">
              {data.meetings.map((m) => (
                <li key={m.id} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-foreground/40 shrink-0" />
                  <button onClick={() => navigate(`/company/${companyId}/meetings?id=${m.id}`)} className="text-sm text-left hover:underline">{m.question}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Upcoming Goals" icon={Target}>
          <ul className="space-y-2.5 text-sm">
            {(company.priorities?.length ? company.priorities : ["Convene your board", "Assemble your executive team", "Record your first decision"]).slice(0, 4).map((g, i) => (
              <li key={i} className="flex items-center gap-3"><CheckSquare className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />{g}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}