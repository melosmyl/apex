import React, { useEffect, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Target, CheckSquare, Landmark, FileText, Scale,
  TrendingUp, CircleDot
} from "lucide-react";
import { computeStreak, countRecentActivity, computeTimeSaved } from "@/lib/momentum";
import MomentumWidget from "@/components/dashboard/MomentumWidget";
import OpenCommitmentsWidget from "@/components/dashboard/OpenCommitmentsWidget";
import MilestoneTracker from "@/components/dashboard/MilestoneTracker";
import BuildStateWidget from "@/components/dashboard/BuildStateWidget";
import TimeSavedWidget from "@/components/dashboard/TimeSavedWidget";

export default function Dashboard() {
  const { company, setCompany } = useOutletContext();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [decisions, tasks, docs, meetings, advisors] = await Promise.all([
        base44.entities.Decision.filter({ company_id: companyId }, "-created_date", 5),
        base44.entities.Task.filter({ company_id: companyId }, "-created_date", 200),
        base44.entities.Document.filter({ company_id: companyId }, "-created_date", 200),
        base44.entities.BoardMeeting.filter({ company_id: companyId }, "-created_date", 200),
        base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100),
      ]);
      setData({ decisions, tasks, docs, meetings, advisors });
    })();
  }, [companyId]);

  // Stage 2: compute momentum and time-saved from all activity
  const allMeetings = data?.meetings || [];
  const allDecisions = data?.decisions || [];
  const allTasks = data?.tasks || [];
  const allDocs = data?.docs || [];
  const allAdvisors = data?.advisors || [];
  const streak = computeStreak(allMeetings, allDecisions, allTasks, allDocs);
  const recentCount = countRecentActivity(allMeetings, allDecisions, allTasks, allDocs, 7);
  const timeSavedMin = computeTimeSaved(allMeetings, allDecisions, allTasks, allDocs);

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
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Your next move</div>
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

      {/* Current priorities — max 5, each with an action */}
      {priorities.length > 0 && (
        <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Target className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
              <h3 className="font-display text-lg">Current priorities</h3>
            </div>
          </div>
          <ul className="space-y-3">
            {priorities.map((p, i) => (
              <li key={i} className="flex items-center gap-3 group">
                <span className="font-display text-sm text-muted-foreground/60 w-6">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm flex-1">{p}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Continue where you left off + Recent progress */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Continue */}
        <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
          <div className="flex items-center gap-2.5 mb-4">
            <CircleDot className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
            <h3 className="font-display text-lg">Continue where you left off</h3>
          </div>
          {!data ? (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          ) : openTasks.length === 0 && (data.meetings?.length || 0) === 0 ? (
            <div className="text-sm text-muted-foreground">
              <p className="mb-3">You're all caught up. Your next move:</p>
              <Button onClick={() => go("boardroom")} variant="outline" className="rounded-full text-sm">Convene a board meeting</Button>
            </div>
          ) : (
            <ul className="space-y-3">
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
        <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
          <div className="flex items-center gap-2.5 mb-4">
            <TrendingUp className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
            <h3 className="font-display text-lg">Recent progress</h3>
          </div>
          {!data ? (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          ) : recentProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No progress recorded yet. Your first meeting will appear here.</p>
          ) : (
            <ul className="space-y-3">
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

      {/* Momentum + Time Saved */}
      <div className="grid sm:grid-cols-2 gap-5">
        <MomentumWidget streak={streak} recentCount={recentCount} />
        <TimeSavedWidget minutes={timeSavedMin} />
      </div>

      <OpenCommitmentsWidget tasks={allTasks} meetings={allMeetings} companyId={companyId} />

      {/* Where you're going (self-reported) vs what's actually happened (computed) */}
      <div className="grid lg:grid-cols-2 gap-5">
        <MilestoneTracker company={company} companyId={companyId} onUpdate={setCompany} />
        <BuildStateWidget advisors={allAdvisors} meetings={allMeetings} decisions={allDecisions} docs={allDocs} tasks={allTasks} />
      </div>

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