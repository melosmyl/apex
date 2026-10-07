import React from "react";

// The five steps along the top of a live meeting (meeting mock): done steps
// in ink, the current one in burgundy, a round the engine didn't need
// marked as skipped.
export default function MeetingProgress({ steps }) {
  return (
    <ol className="my-4 grid grid-cols-5 gap-2" aria-label="Progress">
      {steps.map((s) => (
        <li
          key={s.key}
          aria-current={s.status === "now" ? "step" : undefined}
          className={`border-t-[3px] pt-2 ${
            s.status === "done" ? "border-foreground" : s.status === "now" ? "border-brand" : s.status === "skipped" ? "border-dashed border-border" : "border-border"
          }`}
        >
          <span className={`room-mono block !text-[0.62rem] ${s.status === "now" ? "!text-brand" : s.status === "skipped" ? "line-through" : ""}`}>{s.label}</span>
          <small className={`text-[0.78rem] leading-snug text-muted-foreground sm:block ${s.status === "skipped" ? "block !text-[0.62rem]" : "hidden"}`}>{s.status === "skipped" ? <><span className="sm:hidden">Skipped</span><span className="hidden sm:inline">{s.sub}</span></> : s.sub}</small>
        </li>
      ))}
    </ol>
  );
}
