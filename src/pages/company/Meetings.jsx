import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { CalendarClock, Search, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import MeetingResult from "@/components/boardroom/MeetingResult";
import { format } from "date-fns";

export default function Meetings() {
  const { companyId } = useParams();
  const [items, setItems] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);

  useEffect(() => {
    base44.entities.BoardMeeting.filter({ company_id: companyId }, "-created_date", 100).then(setItems);
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors);
  }, [companyId]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id && items) { const m = items.find((x) => x.id === id); if (m) setActive(m); }
  }, [items]);

  if (active) {
    return (
      <div>
        <Button variant="ghost" className="mb-4 -ml-2" onClick={() => setActive(null)}><ChevronLeft className="w-4 h-4 mr-1" /> All meetings</Button>
        <h1 className="font-display text-2xl sm:text-3xl font-light mb-1">"{active.question}"</h1>
        <p className="text-sm text-muted-foreground mb-8">{active.created_date ? format(new Date(active.created_date), "d MMMM yyyy") : ""} · {active.participants?.length} participants</p>
        {/* Stored rows key the meeting as `id`; MeetingResult expects the
            live boardroom shape, which uses `meeting_id`. */}
        <MeetingResult result={{ ...active, meeting_id: active.id }} advisors={advisors} companyId={companyId} />
      </div>
    );
  }

  const filtered = (items || []).filter((m) => m.question.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader eyebrow="Your boardroom archive" title="Meetings"
        description="Replay past discussions and see how opinions evolved over time." />
      {items === null ? <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
        : items.length === 0 ? <EmptyState icon={CalendarClock} title="No meetings yet" description="Every board meeting you convene is saved here automatically." />
        : (
        <>
          <div className="relative mb-5 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics…" className="pl-9 rounded-full" />
          </div>
          <div className="space-y-3">
            {filtered.map((m) => (
              <button key={m.id} onClick={() => setActive(m)} className="w-full text-left bg-card border border-border/70 rounded-2xl p-5 hover:shadow-md transition-all rise-in">
                <h3 className="font-display text-lg leading-snug">{m.question}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{m.recommendation}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span>{m.created_date ? format(new Date(m.created_date), "d MMM yyyy") : ""}</span>
                  {m.confidence_score != null && <span>{Math.round(m.confidence_score)}% confidence</span>}
                  <span>{m.discussion?.length || 0} contributions</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}