import React, { useState } from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Undo2, Check, ChevronDown, ChevronUp, FileText } from "lucide-react";

export default function TaskCard({ task, advisors, executing, onExecute, onCompleteFounder, onMove, canBack, canForward, onOpenDocument }) {
  const [expanded, setExpanded] = useState(false);
  const advisor = advisors.find((a) => a.name === task.assigned_to);
  const isDelegated = task.delegated_back;
  const isDone = task.status === "done";
  const isFounderTask = task.assigned_to === "Founder";
  const canExecute = advisor && !isDone && !isDelegated && !executing && task.status !== "review";
  const canComplete = !isDone && (isDelegated || isFounderTask || task.status === "review");
  const hasDocument = !!task.document_id;

  return (
    <div className={`bg-card border rounded-xl p-3 rise-in ${isDelegated ? "border-amber-300 bg-amber-50/40" : "border-border/70"}`}>
      <p className="text-sm leading-snug mb-2">{task.title}</p>

      {isDelegated && (
        <Badge variant="outline" className="mb-2 bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-normal">
          <Undo2 className="w-3 h-3 mr-1" /> Delegated to you
        </Badge>
      )}

      {(isDelegated || task.deliverable) && (
        <div className="mb-2">
          <button onClick={() => setExpanded((v) => !v)} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {isDelegated ? "Why it's back" : "View summary"}
          </button>
          {expanded && (
            <p className="text-xs text-muted-foreground bg-secondary/60 rounded-lg p-2.5 mt-1.5 whitespace-pre-wrap leading-relaxed">
              {isDelegated ? task.blocker : task.deliverable}
            </p>
          )}
        </div>
      )}

      {hasDocument && (
        <button
          onClick={() => onOpenDocument?.(task.document_id)}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 mb-2"
        >
          <FileText className="w-3 h-3" /> Open deliverable
        </button>
      )}

      <div className="flex items-center justify-between gap-2">
        {task.assigned_to ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <AdvisorAvatar name={task.assigned_to} accent={advisor?.accent || "#7a5c3e"} size="sm" />
            <span className="text-[11px] text-muted-foreground truncate">{task.assigned_to.split(" ")[0]}</span>
          </div>
        ) : <span className="text-[11px] text-muted-foreground">Unassigned</span>}

        <div className="flex items-center gap-1 shrink-0">
          {executing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : canExecute ? (
            <button onClick={() => onExecute(task)} title="Advisor executes this task" className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 px-1.5 py-0.5 rounded-md hover:bg-accent transition-colors">
              <Sparkles className="w-3 h-3" /> Execute
            </button>
          ) : canComplete ? (
            <button onClick={() => onCompleteFounder(task)} title="Mark complete" className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 px-1.5 py-0.5 rounded-md hover:bg-emerald-50 transition-colors">
              <Check className="w-3 h-3" /> Done
            </button>
          ) : null}
          {canBack && <button onClick={() => onMove(task, "back")} className="text-xs text-muted-foreground hover:text-foreground px-1">‹</button>}
          {canForward && <button onClick={() => onMove(task, "forward")} className="text-xs text-muted-foreground hover:text-foreground px-1">›</button>}
        </div>
      </div>
    </div>
  );
}