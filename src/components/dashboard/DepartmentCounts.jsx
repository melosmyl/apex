import React from "react";
import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { DEPARTMENTS } from "@/lib/departments";
import "@/styles/taskBoard.css";

// Open tasks in each department (Workstream T). Each bar is the department
// colour on its partner colour, with an ink outline where the pair alone is
// too faint; each row opens the board filtered to that department.
export default function DepartmentCounts({ tasks = [], companyId }) {
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) return null;
  const counts = DEPARTMENTS.map((d) => ({ ...d, n: open.filter((t) => t.department === d.key).length }));
  const most = Math.max(...counts.map((c) => c.n), 1);

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
      <div className="flex items-center gap-2.5 mb-1">
        <LayoutGrid className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} />
        <h3 className="font-display text-lg">Open tasks by department</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{open.length} open in all. Choose one to see that department on the board.</p>
      <div className="dept-counts">
        {counts.map((c) => (
          <Link key={c.key} to={`/company/${companyId}/tasks?dept=${c.key}`} aria-label={`${c.label}: ${c.n} open`}>
            <span className="label">{c.label}</span>
            <span className="track" style={{ background: c.chip }} aria-hidden="true">
              <span className={`fill${c.n ? "" : " fill--empty"}`} style={{ width: `${(c.n / most) * 100}%`, background: c.band }} />
            </span>
            <span className="n">{c.n}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
