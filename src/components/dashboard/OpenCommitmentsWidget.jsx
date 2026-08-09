import React from "react";
import { useNavigate } from "react-router-dom";
import { Handshake } from "lucide-react";

const OVERDUE_AFTER_DAYS = 14;
const MAX_SHOWN = 4;

function daysSince(date) {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
}

function ageLabel(days) {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// Commitments are tasks the founder chose to take on after a board meeting.
// Deliberately quiet: no counts or badges, and the whole card disappears when
// nothing is outstanding.
export default function OpenCommitmentsWidget({ tasks = [], meetings = [], companyId }) {
  const navigate = useNavigate();

  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  const commitments = tasks
    .filter((t) => t.source_meeting_id && t.status !== "done")
    .map((t) => ({ ...t, days: daysSince(t.created_date || t.created_at) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, MAX_SHOWN);

  if (!commitments.length) return null;

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in h-full">
      <div className="flex items-center gap-2.5 mb-1">
        <Handshake className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-lg">Open commitments</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">What you took on after past board meetings.</p>

      <ul className="space-y-3">
        {commitments.map((c) => {
          const meeting = meetingById.get(c.source_meeting_id);
          return (
            <li key={c.id}>
              <button
                onClick={() => navigate(`/company/${companyId}/meetings?id=${c.source_meeting_id}`)}
                className="w-full text-left group"
                disabled={!meeting}
              >
                <div className="text-sm leading-snug group-hover:text-brand transition-colors">{c.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className={c.days >= OVERDUE_AFTER_DAYS ? "text-brand" : ""}>{ageLabel(c.days)}</span>
                  {meeting && <span> · from "{meeting.question}"</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
