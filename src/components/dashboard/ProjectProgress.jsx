import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight } from "lucide-react";

const SEGMENTS = [
  { key: "done", label: "Done", color: "bg-emerald-500" },
  { key: "review", label: "Review", color: "bg-blue-400" },
  { key: "in_progress", label: "In Progress", color: "bg-amber-400" },
  { key: "todo", label: "To Do", color: "bg-stone-300" },
];

export default function ProjectProgress({ companyId, onNavigate }) {
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    (async () => {
      const [projs, allTasks] = await Promise.all([
        base44.entities.Project.filter({ company_id: companyId }, "-created_date", 100),
        base44.entities.Task.filter({ company_id: companyId }, "-created_date", 200),
      ]);
      setProjects(projs);
      setTasks(allTasks);
    })();
  }, [companyId]);

  if (projects === null) return null;
  const active = projects.filter((p) => p.status === "active");
  if (active.length === 0) return null;

  return (
    <div className="mb-6 rise-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="font-display text-xl">Active Projects</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {SEGMENTS.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />{s.label}
            </span>
          ))}
          <button onClick={onNavigate} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-1">View all <ArrowRight className="w-3 h-3" /></button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {active.map((project) => {
          const pTasks = tasks.filter((t) => t.project_id === project.id);
          const total = pTasks.length;
          const counts = SEGMENTS.reduce((acc, s) => ({ ...acc, [s.key]: pTasks.filter((t) => t.status === s.key).length }), {});
          const pct = total ? Math.round((counts.done / total) * 100) : 0;
          return (
            <div key={project.id} className="bg-card border border-border/70 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="font-display text-lg leading-tight">{project.name}</h3>
              </div>
              {project.description && <p className="text-sm text-muted-foreground line-clamp-1 mb-4">{project.description}</p>}
              <div className="mb-2">
                {total > 0 ? (
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    {SEGMENTS.map((s) => {
                      const w = (counts[s.key] / total) * 100;
                      return w > 0 ? <div key={s.key} className={`${s.color} transition-all`} style={{ width: `${w}%` }} /> : null;
                    })}
                  </div>
                ) : (
                  <div className="h-2.5 w-full rounded-full bg-secondary" />
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{total > 0 ? `${counts.done} of ${total} tasks complete` : "No tasks linked yet"}</span>
                <span className="font-display text-base text-foreground">{pct}%</span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                <span>{project.executive_owner || "Unassigned"}</span>
                <span>{project.timeline || "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}