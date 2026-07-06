import React, { useMemo, useState } from "react";
import { format, parseISO, differenceInDays, startOfMonth, addMonths } from "date-fns";
import { base44 } from "@/api/base44Client";
import { GanttChart, CalendarPlus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/EmptyState";

const STATUS_BAR = {
  todo: "bg-stone-300/80 border-stone-400/50 text-stone-800",
  in_progress: "bg-emerald-400/80 border-emerald-500/50 text-emerald-950",
  review: "bg-amber-400/80 border-amber-500/50 text-amber-950",
  done: "bg-blue-400/80 border-blue-500/50 text-blue-950",
};

export default function GanttTimeline({ projects, tasks, onTasksChange }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);

  const scheduled = useMemo(() => tasks.filter((t) => t.start_date && t.end_date), [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !(t.start_date && t.end_date)), [tasks]);

  const range = useMemo(() => {
    if (scheduled.length === 0) return null;
    const parsed = scheduled.map((t) => ({ s: +parseISO(t.start_date), e: +parseISO(t.end_date) }));
    const min = new Date(Math.min(...parsed.map((p) => p.s)));
    const max = new Date(Math.max(...parsed.map((p) => p.e)));
    return { min, max, totalDays: Math.max(1, differenceInDays(max, min) + 1) };
  }, [scheduled]);

  const months = useMemo(() => {
    if (!range) return [];
    const arr = [];
    let cur = startOfMonth(range.min);
    while (cur <= range.max) {
      arr.push({ date: cur, left: (differenceInDays(cur, range.min) / range.totalDays) * 100 });
      cur = addMonths(cur, 1);
    }
    return arr;
  }, [range]);

  const groups = useMemo(
    () => projects.map((p) => ({ project: p, rows: scheduled.filter((t) => t.project_id === p.id) })).filter((g) => g.rows.length > 0),
    [projects, scheduled]
  );

  const pos = (start, end) => {
    if (!range) return { left: 0, width: 0 };
    const left = (differenceInDays(parseISO(start), range.min) / range.totalDays) * 100;
    const width = Math.max(1.5, ((differenceInDays(parseISO(end), parseISO(start)) + 1) / range.totalDays) * 100);
    return { left, width };
  };

  const openEdit = (task) => {
    setEditing(task);
    setForm({ start_date: task.start_date || "", end_date: task.end_date || "" });
  };

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.Task.update(editing.id, { start_date: form.start_date, end_date: form.end_date });
      setEditing(null);
      onTasksChange();
    } finally {
      setSaving(false);
    }
  };

  const unscheduledList = unscheduled.length > 0 && (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Unscheduled · {unscheduled.length}</p>
      <div className="space-y-2">
        {unscheduled.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/40 px-4 py-2.5">
            <span className="text-sm font-medium truncate">{t.title}</span>
            <Button size="sm" variant="outline" onClick={() => openEdit(t)} className="rounded-full shrink-0"><CalendarPlus className="w-3.5 h-3.5 mr-1.5" /> Add dates</Button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {tasks.length === 0 ? (
        <EmptyState icon={GanttChart} title="No tasks to timeline" description="Create tasks with start and end dates to see them plotted on the Gantt chart." />
      ) : scheduled.length === 0 ? (
        unscheduledList
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/70 bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="flex border-b border-border/70">
                  <div className="w-60 shrink-0 px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground">Task</div>
                  <div className="relative flex-1 h-11 overflow-hidden">
                    {months.map((m) => (
                      <div key={+m.date} className="absolute top-0 h-full border-l border-border/50 pl-2 pt-3 text-xs text-muted-foreground whitespace-nowrap" style={{ left: `${m.left}%` }}>
                        {format(m.date, "MMM yy")}
                      </div>
                    ))}
                  </div>
                </div>
                {groups.map((g) => (
                  <div key={g.project.id}>
                    <div className="flex bg-secondary/40 border-y border-border/70">
                      <div className="w-60 shrink-0 px-5 py-2 text-sm font-display">{g.project.name}</div>
                      <div className="flex-1" />
                    </div>
                    {g.rows.map((t) => {
                      const { left, width } = pos(t.start_date, t.end_date);
                      return (
                        <div key={t.id} className="flex border-b border-border/40 hover:bg-secondary/20">
                          <div className="w-60 shrink-0 px-5 py-2.5 truncate text-sm">{t.title}</div>
                          <div className="relative flex-1 h-9">
                            <button
                              onClick={() => openEdit(t)}
                              className={`absolute top-1.5 h-6 rounded-md border ${STATUS_BAR[t.status] || STATUS_BAR.todo} flex items-center px-2 text-xs font-medium hover:opacity-90 transition-opacity overflow-hidden`}
                              style={{ left: `${left}%`, width: `${width}%` }}
                              title={`${format(parseISO(t.start_date), "d MMM")} – ${format(parseISO(t.end_date), "d MMM yyyy")}`}
                            >
                              <span className="truncate whitespace-nowrap">{format(parseISO(t.start_date), "d MMM")} – {format(parseISO(t.end_date), "d MMM")}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {unscheduledList}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-xl font-light">Edit task dates</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">{editing.title}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="mb-1.5 block">Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
                <div><Label className="mb-1.5 block">End date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} disabled={saving || !form.start_date || !form.end_date}>{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}