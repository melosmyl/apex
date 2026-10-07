import React from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { portraitFor } from "@/lib/portraits";
import { initialsOf } from "@/lib/advisorLibrary";
import { ProfileTrigger } from "@/components/advisors/AdvisorProfilePanel";

// The Boardroom's "At the table" panel (Workstream L, from the boardroom
// mock): the Chair in gold, then everyone else as seat cards. Each card's
// portrait opens the advisor's profile; the toggle under it seats or benches
// them for the next meeting (the owner's call: attendance lives here rather
// than in a "Bring your full board in?" dialog). Empty seats up to the
// board's cap invite the founder to add someone.

function Portrait({ advisor }) {
  const p = portraitFor({ libraryKey: advisor.library_key, name: advisor.name });
  if (p) {
    return (
      <img
        src={p.card}
        alt=""
        loading="lazy"
        className="block w-full aspect-[4/5] object-cover object-top rounded-[2px]"
      />
    );
  }
  return (
    <div className="w-full aspect-[4/5] rounded-[2px] bg-secondary flex items-center justify-center font-mono text-2xl" aria-hidden="true">
      {initialsOf(advisor.name)}
    </div>
  );
}

function Seat({ advisor, chair = false, benched = false, onToggle, toggleDisabled }) {
  return (
    <figure
      className={`relative min-w-0 border-2 border-foreground rounded-[4px] px-1.5 pt-1.5 transition-[transform,opacity] duration-300 hover:-translate-y-1 ${
        chair ? "bg-[hsl(var(--gold))]" : "bg-card"
      } ${benched ? "opacity-60 shadow-none" : "shadow-[3px_3px_0_hsl(var(--foreground))]"}`}
    >
      {chair && (
        <span className="absolute -top-2.5 left-2 z-10 rounded-full border-2 border-foreground bg-[hsl(var(--live-fill))] px-1.5 py-px font-mono text-[0.58rem] uppercase tracking-[0.12em]">
          Chair
        </span>
      )}
      <ProfileTrigger advisor={advisor.id ? advisor : undefined} name={advisor.name} libraryKey={advisor.library_key} className="block w-full">
        <div className={benched ? "grayscale" : ""}>
          <Portrait advisor={advisor} />
        </div>
      </ProfileTrigger>
      <figcaption className="px-1 pt-2 pb-2">
        <b className="block font-display font-medium text-[0.92rem] leading-tight line-clamp-2 break-words" title={advisor.name}>{advisor.name}</b>
        <span className={`block font-mono text-[0.58rem] uppercase tracking-[0.12em] leading-snug ${chair ? "text-foreground" : "text-muted-foreground"}`}>
          {chair ? "Opens & writes the resolution" : advisor.role}
        </span>
        {!chair && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            disabled={toggleDisabled}
            aria-pressed={!benched}
            aria-label={`${advisor.name} attending`}
            className={`mt-2 w-full rounded-full border-[1.5px] border-foreground px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-[0.12em] transition-colors disabled:opacity-40 ${
              benched ? "bg-transparent hover:bg-card" : "bg-foreground text-background hover:bg-brand hover:border-brand"
            }`}
          >
            {benched ? "Benched" : "Attending"}
          </button>
        )}
      </figcaption>
    </figure>
  );
}

export default function BoardTable({ chair, advisors, attendingIds, onToggle, canSeat, emptySeats = 0, teamHref, seatsFilled, seatCap }) {
  return (
    <section
      aria-label="Your board at the table"
      className="relative overflow-hidden rounded-md border-2 border-foreground bg-[hsl(var(--panel))] p-4 sm:p-5 shadow-[4px_4px_0_hsl(var(--foreground))]"
    >
      <div className="room-dots pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <span className="room-mono">At the table</span>
        <span className="room-mono hidden sm:inline">Open a portrait to meet them</span>
      </div>
      <div className="relative grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {chair && <Seat advisor={chair} chair />}
        {advisors.map((a) => {
          const benched = !attendingIds.includes(a.id);
          return (
            <Seat
              key={a.id}
              advisor={a}
              benched={benched}
              onToggle={() => onToggle(a)}
              toggleDisabled={benched && !canSeat(a)}
            />
          );
        })}
        {Array.from({ length: emptySeats }, (_, i) => (
          <Link
            key={`empty-${i}`}
            to={teamHref}
            className="flex min-h-[10rem] flex-col items-center justify-center gap-1 rounded-[4px] border-2 border-dashed border-foreground/60 p-3 text-center text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Invite an advisor
          </Link>
        ))}
      </div>
      {advisors.some((a) => !attendingIds.includes(a.id) && !canSeat(a)) && (
        <p className="relative mt-4 text-sm text-muted-foreground">Five advisors can debate at once. Bench someone to seat another.</p>
      )}
      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="room-mono">{seatsFilled} of {seatCap} seats filled</span>
        <Link to={teamHref} className="room-mono !text-foreground border-b border-foreground">
          Change who's in the room →
        </Link>
      </div>
    </section>
  );
}
