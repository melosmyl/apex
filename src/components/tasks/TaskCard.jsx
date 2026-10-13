import React, { useState } from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Badge } from "@/components/ui/badge";
import { Undo2, Check, ChevronDown, ChevronUp, FileText, MessageCircle } from "lucide-react";
import TaskDesk from "@/components/tasks/TaskDesk";

// "Do this for me" (TaskDesk) replaces the old Execute button, which ran the
// cheap model with no web access and wrote its own "sources" (Workstream M).
export default function TaskCard({ task, advisors, run, onRunChanged, acknowledging, onCompleteFounder, onMove, canBack, canForward, onOpenDocument }) {
  const [expanded, setExpanded] = useState(false);
  const advisor = advisors.find((a) => a.id === task.advisor_id) || advisors.find((a) => a.name === task.assigned_to);
  const isDelegated = task.delegated_back;
  const isDone = task.status === "done";
  const isFounderTask = task.assigned_to === "Founder";
  // A finished "Do this for me" result waits for Accept / Redo / Discard;
  // "Done" here would skip saving it.
  const awaitingDecision = run?.status === "done";
  const canComplete = !isDone && !awaitingDecision && (isDelegated || isFounderTask || task.status === "review");
  const hasDocument = !!task.document_id;
  const isCommitment = !!task.source_meeting_id;
  const acknowledgingAdvisor = advisors.find((a) => a.name === task.advisor_acknowledgment_by);

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

      {isDone && isCommitment && (task.advisor_acknowledgment || acknowledging) && (
        <div className="flex gap-2 mb-2 mt-1">
          {task.advisor_acknowledgment ? (
            <>
              <AdvisorAvatar name={task.advisor_acknowledgment_by} accent={acknowledgingAdvisor?.accent || "#7a5c3e"} size="sm" />
              <div className="flex-1 min-w-0 bg-secondary/60 rounded-lg p-2.5">
                <div className="text-[10px] font-medium text-muted-foreground mb-0.5">{task.advisor_acknowledgment_by}</div>
                <p className="text-xs leading-relaxed text-foreground/90">{task.advisor_acknowledgment}</p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MessageCircle className="w-3 h-3 animate-pulse" /> {task.assigned_to || "The board"} is responding…
            </div>
          )}
        </div>
      )}

      <TaskDesk task={task} run={run} onChanged={onRunChanged} compact />

      <div className="mt-2 flex items-center justify-between gap-2">
        {task.assigned_to ? (
          <div className="flex items-center gap-1.5 min-w-0">
            <AdvisorAvatar name={task.assigned_to} accent={advisor?.accent || "#7a5c3e"} size="sm" />
            <span className="text-[11px] text-muted-foreground truncate">{task.assigned_to.split(" ")[0]}</span>
          </div>
        ) : <span className="text-[11px] text-muted-foreground">Unassigned</span>}

        <div className="flex items-center gap-1 shrink-0">
          {canComplete ? (
            <button onClick={() => onCompleteFounder(task)} title="Mark complete" className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 px-1.5 py-0.5 rounded-md hover:bg-emerald-50 transition-colors">
              <Check className="w-3 h-3" /> Done
            </button>
          ) : null}
          {canBack && <button onClick={() => onMove(task, "back")} className="text-xs text-muted-foreground hover:text-foreground px-1">‹</button>}
          {canForward && !awaitingDecision && <button onClick={() => onMove(task, "forward")} className="text-xs text-muted-foreground hover:text-foreground px-1">›</button>}
        </div>
      </div>
    </div>
  );
}