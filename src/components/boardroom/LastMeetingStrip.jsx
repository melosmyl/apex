import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";

// "Last meeting" under the Boardroom's ask box (Workstream L): the question,
// what the board resolved, how many of its tasks are still open and the
// board's confidence, with a link to the minutes. Only real data: if a
// figure isn't there, it isn't shown.
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
const dateFmtYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const formatDate = (d) => (d.getFullYear() === new Date().getFullYear() ? dateFmt : dateFmtYear).format(d);

export default function LastMeetingStrip({ companyId }) {
  const [meeting, setMeeting] = useState(null);
  const [tasks, setTasks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    base44.entities.BoardMeeting.filter({ company_id: companyId, status: "complete", meeting_mode: "board_debate" }, "-created_date", 1)
      .then(async (rows) => {
        const m = rows?.[0];
        if (cancelled || !m) return;
        setMeeting(m);
        const ts = await base44.entities.Task.filter({ company_id: companyId, source_meeting_id: m.id }, "-created_date", 20).catch(() => null);
        if (!cancelled) setTasks(ts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  if (!meeting) return null;

  const resolved = meeting.recommendation || meeting.board_resolution?.recommended_direction;
  const open = tasks ? tasks.filter((t) => t.status !== "done").length : null;
  const meta = [
    tasks?.length ? `${open} of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} open` : null,
    Number.isFinite(meeting.confidence_score) ? `${Math.round(meeting.confidence_score)}% confidence` : null,
  ].filter(Boolean);

  return (
    <section className="mt-8 grid gap-4 border-t-2 border-foreground pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8">
      <div className="min-w-0">
        <span className="room-mono">Last meeting · {formatDate(new Date(meeting.created_at || meeting.created_date))}</span>
        <p className="mt-1.5 font-display text-xl font-light leading-snug text-pretty break-words line-clamp-3">
          {meeting.question && <>“{meeting.question}” </>}
          {resolved && <><em className="text-brand">Resolved:</em> {resolved}</>}
        </p>
        {meta.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{meta.join(" · ")}</p>}
      </div>
      <Link
        to={`/company/${companyId}/meetings?id=${meeting.id}`}
        className="self-start whitespace-nowrap border-b border-foreground sm:mt-6"
      >
        Read the minutes →
      </Link>
    </section>
  );
}
