import React from "react";
import { Scale, CheckCircle2, Calendar, TrendingUp, Gauge } from "lucide-react";

function relativeTime(dateStr) {
  if (!dateStr) return "NONE YET";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

function StatCell({ icon: Icon, value, line1, line2, className = "" }) {
  return (
    <div className={`bg-secondary p-5 flex items-center gap-4 ${className}`}>
      <Icon className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={1.5} />
      <div className="min-w-0">
        <div className="text-2xl sm:text-3xl font-display font-light leading-none truncate">{value}</div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-2 leading-tight">
          <div>{line1}</div>
          <div>{line2}</div>
        </div>
      </div>
    </div>
  );
}

export default function StatsWidget({ decisions = [], meetings = [], tasks = [] }) {
  const decisionsWaiting = decisions.filter((d) => d.status === "pending").length;

  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const tasksCompletedOvernight = tasks.filter(
    (t) => t.status === "done" && t.updated_date && new Date(t.updated_date).getTime() >= cutoff
  ).length;

  const lastMeeting = meetings[0];
  const meetingValue = lastMeeting?.created_date
    ? new Date(lastMeeting.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  const now = new Date();
  const monthMeetings = meetings.filter((m) => {
    const d = new Date(m.created_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const scores = monthMeetings.map((m) => m.confidence_score).filter((s) => typeof s === "number");
  const boardConfidence = scores.length
    ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%`
    : "—";

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const productivity = tasks.length ? `${Math.round((doneTasks / tasks.length) * 100)}%` : "—";

  return (
    <div className="mb-8 rise-in">
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-border">
          <StatCell icon={Scale} value={decisionsWaiting} line1="Decisions" line2="Waiting" />
          <StatCell icon={CheckCircle2} value={tasksCompletedOvernight} line1="Tasks Completed" line2="Overnight" />
          <StatCell icon={Calendar} value={meetingValue} line1="Last Board Meeting" line2={relativeTime(lastMeeting?.created_date)} />
          <StatCell icon={TrendingUp} value={boardConfidence} line1="Board Confidence" line2="This Month" />
          <StatCell icon={Gauge} value={productivity} line1="Productivity" line2="Overall" className="col-span-2 sm:col-span-1" />
        </div>
      </div>
    </div>
  );
}