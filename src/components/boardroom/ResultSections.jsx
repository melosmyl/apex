import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { TASK_TYPE_LABELS } from "@/lib/meetingResult";

// The results sections (M1), shared by a meeting's own results page and its
// public share page, so both read in the same order and the same way.

export function Section({ label, title, children }) {
  return (
    <section className="room-card p-5 sm:p-6">
      <span className="room-mono">{label}</span>
      {title && <h3 className="mt-1 mb-4 font-display text-xl leading-snug">{title}</h3>}
      {children}
    </section>
  );
}

// The next-24-hours actions: each with its owner and what kind of work it
// is. These became the meeting's tasks (see runChairSynthesis).
// renderAfter adds something under an action (the results page puts "Do
// this for me" there); the share page passes nothing.
export function Actions({ actions, advisorsByName = {}, founderLabel = "You", renderAfter }) {
  return (
    <ol className="space-y-4">
      {actions.map((a, i) => {
        const owner = advisorsByName[a.assigned_to];
        const isFounder = !a.assigned_to || a.assigned_to === "Founder";
        return (
          <li key={i} className="flex gap-3">
            <span className="font-display text-2xl leading-none text-muted-foreground tabular-nums">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[1rem] font-medium leading-snug">{a.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {!isFounder && <AdvisorAvatar name={a.assigned_to} libraryKey={owner?.library_key} size="xs" />}
                  {isFounder ? founderLabel : a.assigned_to}
                </span>
                {a.task_type && TASK_TYPE_LABELS[a.task_type] && (
                  <span className="rounded-full border border-foreground px-2 py-px font-mono text-[0.65rem] uppercase tracking-[0.12em] text-foreground">{TASK_TYPE_LABELS[a.task_type]}</span>
                )}
                {a.done_when && <span>Done when: {a.done_when}</span>}
              </div>
              {a.why_first && <p className="mt-1 text-sm text-muted-foreground">{a.why_first}</p>}
              {renderAfter?.(a, i)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Issues({ issues }) {
  return (
    <ol className="space-y-3">
      {issues.map((x, i) => (
        <li key={i} className="flex gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
          <span className="font-display text-lg leading-none text-muted-foreground tabular-nums">{i + 1}</span>
          <div className="min-w-0 space-y-0.5 text-[0.95rem] leading-snug">
            <p className="font-medium">{x.problem}</p>
            {x.why_it_matters && <p className="text-muted-foreground">{x.why_it_matters}</p>}
            {x.fix && <p><span className="font-medium">Fix:</span> {x.fix}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Disagreements({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((d, i) => <li key={i} className="flex gap-2 text-[0.95rem] leading-snug"><span className="text-muted-foreground">—</span><span className="min-w-0">{d}</span></li>)}
    </ul>
  );
}
