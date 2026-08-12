import React from "react";

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

function StatCell({ value, line1, line2, className = "" }) {
  return (
    <div className={`bg-card p-6 transition-colors hover:bg-secondary/30 ${className}`}>
      <div className="text-2xl sm:text-3xl font-display font-light leading-none truncate">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-2.5 leading-tight">
        <div>{line1}</div>
        <div>{line2}</div>
      </div>
    </div>
  );
}

// Only real, non-empty numbers get a cell — no em-dash placeholders, no
// zeros standing in for "nothing to report." If nothing here is real, the
// whole widget renders nothing rather than a row of empty scoreboarding.
export default function StatsWidget({ decisions = [], meetings = [], tasks = [] }) {
  const decisionsWaiting = decisions.filter((d) => d.status === "pending").length;

  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const tasksCompletedOvernight = tasks.filter(
    (t) => t.status === "done" && t.updated_date && new Date(t.updated_date).getTime() >= cutoff
  ).length;

  const lastMeeting = meetings[0];

  const now = new Date();
  const monthMeetings = meetings.filter((m) => {
    const d = new Date(m.created_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const scores = monthMeetings.map((m) => m.confidence_score).filter((s) => typeof s === "number");
  const boardConfidence = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const productivity = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : null;

  const cells = [];
  if (decisionsWaiting > 0) cells.push(<StatCell key="decisions" value={decisionsWaiting} line1="Decisions" line2="Waiting" />);
  if (tasksCompletedOvernight > 0) cells.push(<StatCell key="overnight" value={tasksCompletedOvernight} line1="Tasks Completed" line2="Overnight" />);
  if (lastMeeting?.created_date) {
    cells.push(
      <StatCell
        key="lastmeeting"
        value={new Date(lastMeeting.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        line1="Last Board Meeting"
        line2={relativeTime(lastMeeting.created_date)}
      />
    );
  }
  if (boardConfidence !== null) cells.push(<StatCell key="confidence" value={`${boardConfidence}%`} line1="Board Confidence" line2="This Month" />);
  if (productivity !== null) cells.push(<StatCell key="productivity" value={`${productivity}%`} line1="Productivity" line2="Overall" />);

  if (!cells.length) return null;

  return (
    <div className="mb-10 rise-in">
      <div className="rounded-3xl border border-border/60 shadow-soft overflow-hidden bg-card">
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${cells.length >= 4 ? "lg:grid-cols-4" : ""} gap-px bg-border/50`}>
          {cells}
        </div>
      </div>
    </div>
  );
}
