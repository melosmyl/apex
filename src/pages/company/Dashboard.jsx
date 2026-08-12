import React, { useEffect, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CheckSquare, Landmark, FileText, Scale,
  TrendingUp, CircleDot
} from "lucide-react";
import OpenCommitmentsWidget from "@/components/dashboard/OpenCommitmentsWidget";
import ProgressionTree from "@/components/dashboard/ProgressionTree";

export default function Dashboard() {
  const { company } = useOutletContext();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [decisions, tasks, docs, meetings] = await Promise.all([
        base44.entities.Decision.filter({ company_id: companyId }, "-created_date", 5),
        base44.entities.Task.filter({ company_id: companyId }, "-created_date", 200),
        base44.entities.Document.filter({ company_id: companyId }, "-created_date", 200),
        base44.entities.BoardMeeting.filter({ company_id: companyId }, "-created_date", 200),
      ]);
      setData({ decisions, tasks, docs, meetings });
    })();
  }, [companyId]);

  const allMeetings = data?.meetings || [];
  const allTasks = data?.tasks || [];

  const go = (p) => navigate(`/company/${companyId}/${p}`);

  const plan = company?.onboarding_plan;

  const openTasks = data?.tasks?.filter((t) => t.status !== "done") || [];
  const doneTasks = data?.tasks?.filter((t) => t.status === "done") || [];
  const recentProgress = [
    ...doneTasks.map((t) => ({ label: t.title, type: "task", time: t.updated_date })),
    ...(data?.decisions || []).map((d) => ({ label: d.question, type: "decision", time: d.created_date })),
    ...(data?.docs || []).map((d) => ({ label: d.title, type: "document", time: d.created_date })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 4);

  const priorities = (company?.priorities?.length ? company.priorities : plan?.suggested_tasks?.map((t) => t.title) || []).slice(0, 5);

  // Determine "start here" — show onboarding's start_here if board hasn't met yet
  const hasMet = (data?.meetings?.length || 0) > 0;
  const startHere = !hasMet && plan?.start_here_action;

  return (
    <div className="space-y-8">
      {/* Hero: What should I do next? */}
      <div className="rise-in">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Your next move</div>
        <h1 className="text-3xl sm:text-[2.5rem] sm:leading-[1.1] font-light font-display text-balance mb-2">
          {startHere ? plan.start_here_action : "Here's where things stand."}
        </h1>
        {(plan?.executive_briefing || company?.tagline) && (
          <p className="text-muted-foreground max-w-2xl leading-relaxed">{plan?.executive_briefing || company?.tagline}</p>
        )}
        {startHere && (
          <Button onClick={() => go("boardroom")} variant="brand" className="rounded-full px-7 mt-5">
            <Landmark className="w-4 h-4 mr-2" /> Start your first board meeting
          </Button>
        )}
      </div>

      {/* Current priorities — the one loud card on this screen. More
          padding, larger type, amber numerals: this is where the eye
          should land. Everything else on the page is deliberately quieter. */}
      {priorities.length > 0 && (
        <div className="bg-card border border-border/70 rounded-3xl p-8 sm:p-10 rise-in">
          <h3 className="font-display text-2xl sm:text-3xl mb-6">Current priorities</h3>
          <ul className="space-y-5 sm:space-y-6">
            {priorities.map((p, i) => (
              <li key={i} className="flex items-center gap-4 sm:gap-5 group">
                <span className="font-display text-3xl sm:text-4xl text-brand w-10 sm:w-12 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-base sm:text-lg flex-1">{p}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Continue where you left off + Recent progress — quiet and tight,
          recessed a step below the loud card rather than competing with it. */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Continue */}
        <div className="bg-secondary/50 rounded-xl p-5 rise-in">
          <div className="flex items-center gap-2 mb-3">
            <CircleDot className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="font-display text-base">Continue where you left off</h3>
          </div>
          {!data ? (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          ) : openTasks.length === 0 && (data.meetings?.length || 0) === 0 ? (
            <div className="text-sm text-muted-foreground">
              <p className="mb-3">You're all caught up. Your next move:</p>
              <Button onClick={() => go("boardroom")} variant="outline" className="rounded-full text-sm">Convene a board meeting</Button>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {openTasks.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <button onClick={() => go("tasks")} className="flex items-start gap-3 text-left w-full group">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                    <div>
                      <div className="text-sm font-medium group-hover:text-brand transition-colors">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.assigned_to || "Unassigned"}</div>
                    </div>
                  </button>
                </li>
              ))}
              {data.meetings?.slice(0, 1).map((m) => (
                <li key={m.id}>
                  <button onClick={() => navigate(`/company/${companyId}/meetings?id=${m.id}`)} className="flex items-start gap-3 text-left w-full group">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    <div>
                      <div className="text-sm font-medium group-hover:text-brand transition-colors">{m.question}</div>
                      <div className="text-xs text-muted-foreground">Board meeting · {m.status === "complete" ? "Complete" : "In progress"}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent progress */}
        <div className="bg-secondary/50 rounded-xl p-5 rise-in">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <h3 className="font-display text-base">Recent progress</h3>
          </div>
          {!data ? (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          ) : recentProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No progress recorded yet. Your first meeting will appear here.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentProgress.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckSquare className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{item.label}</div>
                    <div className="text-xs text-muted-foreground capitalize">{item.type} completed</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <OpenCommitmentsWidget tasks={allTasks} meetings={allMeetings} companyId={companyId} />

      {/* The Progression Tree — replaces MilestoneTracker (self-reported)
          and BuildStateWidget (computed, but only 5 fixed facts) as of the
          Phase G cutover: one system, derived-or-conversational, not three. */}
      <ProgressionTree companyId={companyId} country={company?.country} />

      {/* Quick access row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Boardroom", icon: Landmark, path: "boardroom" },
          { label: "Tasks", icon: CheckSquare, path: "tasks" },
          { label: "Decisions", icon: Scale, path: "decisions" },
          { label: "Documents", icon: FileText, path: "documents" },
        ].map((item) => (
          <button key={item.path} onClick={() => go(item.path)} className="bg-card border border-border/70 rounded-xl p-4 flex items-center gap-3 hover:border-border hover:shadow-soft transition-all text-left">
            <item.icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-sm font-medium">{item.label}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
          </button>
        ))}
      </div>
    </div>
  );
}
