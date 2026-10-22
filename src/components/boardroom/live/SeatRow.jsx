import React from "react";
import { portraitFor } from "@/lib/portraits";
import { initialsOf } from "@/lib/advisorLibrary";

// The seat cards under the photo (meeting mock): everyone at the table with
// what they're doing now, and the big speech bubble under the row pointing
// up at whoever has the floor.

const STATE_LABEL = {
  chairing: "Chairing",
  speaking: "Speaking",
  thinking: "Thinking",
  spoke: "Spoke",
  up_next: "Up next",
  writing: "Writing",
  absent: "Couldn't answer",
  waiting: "Waiting",
};

// Who has the floor is shown with still cues only (owner, 22 October 2026):
// nothing moves, scales or shifts. The one with the floor is in full colour
// with a heavier ink edge and the offset shadow; everyone else is dimmed and
// a little desaturated. The only transition is a 250ms opacity fade.
function SeatCard({ seat, hasFloor, someoneHasFloor, onOpen }) {
  const p = portraitFor({ libraryKey: seat.libraryKey, name: seat.name });
  const speaking = seat.state === "speaking";
  const dimmed = someoneHasFloor && !hasFloor;
  // The name band: periwinkle for the speaker, chamomile for the Chair (the
  // whole card), an outline for whoever is up next, plain otherwise.
  const band = speaking && !seat.isChair
    ? "bg-[hsl(var(--live-fill))] text-white"
    : seat.state === "up_next"
      ? "rounded-[2px] outline outline-2 -outline-offset-2 outline-foreground"
      : "";
  return (
    <figure
      className={`relative min-w-0 rounded-[4px] border-2 border-foreground px-1 pt-1 ${
        seat.isChair ? "bg-[hsl(var(--gold))]" : "bg-card"
      } ${hasFloor ? "shadow-[0_0_0_1.5px_hsl(var(--foreground)),5px_5px_0_hsl(var(--foreground))]" : ""}`}
    >
      <button type="button" onClick={() => onOpen?.(seat)} className="block w-full" aria-label={`Open ${seat.name}'s profile`}>
        <span className={`block transition-opacity [transition-duration:250ms] ease-linear ${dimmed ? "opacity-60 saturate-[0.7]" : "opacity-100"}`}>
          {p ? (
            <img src={p.avatar2x} alt="" className="block aspect-square w-full rounded-[2px] object-cover object-top" />
          ) : (
            <span className="flex aspect-square w-full items-center justify-center rounded-[2px] bg-secondary font-mono text-lg" aria-hidden="true">{initialsOf(seat.name)}</span>
          )}
        </span>
      </button>
      <figcaption className={`mb-1 mt-1 px-1 pb-0.5 pt-0.5 ${band}`}>
        <b className="block truncate font-display text-[0.86rem] font-medium leading-tight" title={seat.name}>{seat.shortName}</b>
        <span className={`font-mono text-[0.55rem] uppercase tracking-[0.1em] ${speaking && !seat.isChair ? "text-white" : seat.isChair || seat.state === "up_next" ? "text-foreground" : "text-muted-foreground"}`}>
          {STATE_LABEL[seat.state]}
          {seat.state === "thinking" && <span className="meeting-dots" aria-hidden="true" />}
        </span>
      </figcaption>
    </figure>
  );
}

export default function SeatRow({ seats, bubble, onOpen }) {
  const speakerIndex = seats.findIndex((s) => s.state === "speaking");
  const writerIndex = seats.findIndex((s) => s.state === "writing");
  const pointAt = speakerIndex >= 0 ? speakerIndex : writerIndex;
  return (
    <section aria-label="Who is at the table" className="relative mt-4 rounded-md border-2 border-foreground bg-[hsl(var(--panel))] p-4 shadow-[4px_4px_0_hsl(var(--foreground))]">
      <div className="room-dots pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative grid grid-cols-3 items-end gap-3 sm:grid-cols-6">
        {seats.map((s, i) => <SeatCard key={s.chairId} seat={s} hasFloor={i === pointAt} someoneHasFloor={pointAt >= 0} onOpen={onOpen} />)}
      </div>
      {bubble && (
        <div
          className="meeting-now relative mt-4"
          style={{ "--col3": (Math.max(pointAt, 0) % 3) + 1, "--col6": Math.max(pointAt, 0) + 1 }}
          aria-live="polite"
        >
          <div className={`meeting-now-bubble ${pointAt >= 0 ? "has-tail" : ""} ${pointAt >= 3 ? "tail-wide-only" : ""} rounded-[14px] border-2 border-foreground bg-card px-4 py-3 shadow-[3px_3px_0_hsl(var(--foreground))]`}>
            <span className="room-mono block">{bubble.label}</span>
            <p className="mt-1 font-display text-[1.15rem] font-light leading-snug text-pretty">{bubble.text}</p>
            {bubble.why && <p className="mt-1 text-[0.98rem] leading-snug text-pretty">Why: {bubble.why}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
