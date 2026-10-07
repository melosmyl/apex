import React from "react";
import { portraitFor } from "@/lib/portraits";
import { initialsOf } from "@/lib/advisorLibrary";
import { turnFlags, countsFor } from "@/lib/meetingPlayback";

// "Minutes, as they happen" (meeting mock): each turn as a speech bubble
// beside the advisor's portrait, with what the turn did ("Challenges
// Amara", "Changed position"), filling in as playback reaches it. Advisors
// still writing show as a dashed bubble with their thinking line.

const FLAG_TONE = {
  disagree: "bg-brand text-brand-foreground border-brand",
  agree: "bg-[hsl(var(--sage))] border-foreground",
  changed: "bg-[hsl(var(--live-fill))] border-foreground",
};

function Portrait({ name, libraryKey }) {
  const p = portraitFor({ libraryKey, name });
  return p ? (
    <img src={p.avatar2x} alt="" className="h-16 w-[52px] rounded-[3px] border-2 border-foreground object-cover object-top shadow-[2px_2px_0_hsl(var(--foreground))]" />
  ) : (
    <span className="flex h-16 w-[52px] items-center justify-center rounded-[3px] border-2 border-foreground bg-card font-mono text-xs shadow-[2px_2px_0_hsl(var(--foreground))]" aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

function Say({ children, tone = "plain" }) {
  const look =
    tone === "chair" ? "bg-[hsl(var(--gold)/0.35)] border-solid shadow-[3px_3px_0_hsl(var(--foreground))]" :
    tone === "thinking" ? "border-dashed bg-transparent text-muted-foreground italic" :
    "bg-card shadow-[3px_3px_0_hsl(var(--foreground))]";
  return (
    <div className={`relative max-w-3xl rounded-[14px] border-2 border-foreground px-4 py-3 ${look} ${tone === "plain" ? "room-bubble--tail-left" : ""}`}>
      {children}
    </div>
  );
}

export default function MeetingMinutes({ items, revealed, thinking = [], chairWriting = null, advisorsByName = {}, participants = [], missed = [], onPin, onOpen }) {
  const shown = items.slice(0, revealed);
  const counts = countsFor(shown, participants);
  // Where each round's last shown turn is, so a note about who missed that
  // round sits right after it.
  const lastIndexOfRound = {};
  shown.forEach((m, i) => { if (m.kind === "turn") lastIndexOfRound[m.round] = i; });
  return (
    <section className="mt-7" aria-label="Minutes">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="room-mono">Minutes, as they happen</span>
        <span className="room-mono">
          {counts.challenges} {counts.challenges === 1 ? "challenge" : "challenges"} · {counts.changed} changed {counts.changed === 1 ? "position" : "positions"}
        </span>
      </div>

      {shown.map((m, i) => {
        const advisor = advisorsByName[m.advisor_name];
        if (m.unavailable) {
          return (
            <p key={i} className="border-t border-border py-3 text-sm italic text-muted-foreground">
              {m.advisor_name} couldn't give a view in Round {m.round}.
            </p>
          );
        }
        const flags = turnFlags(m, participants);
        const missedHere = missed.find((x) => lastIndexOfRound[x.round] === i);
        return (
          <React.Fragment key={i}>
          <article className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-4 border-t border-border py-4 rise-in">
            <button type="button" onClick={() => onOpen?.(m.advisor_name)} aria-label={`Open ${m.advisor_name}'s profile`}>
              <Portrait name={m.advisor_name} libraryKey={advisor?.library_key} />
            </button>
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <b className="font-display text-[1.05rem] font-medium">{m.advisor_name}</b>
                <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {m.kind === "opening" ? "Opening" : m.message_type === "final_statement" ? `Round ${m.round} · closing` : `Round ${m.round}`}
                </span>
                {flags.map((f) => (
                  <span key={f.label} className={`rounded-full border-[1.5px] px-2 py-px font-mono text-[0.58rem] uppercase tracking-[0.12em] ${FLAG_TONE[f.tone]}`}>{f.label}</span>
                ))}
              </div>
              <Say tone={m.kind === "opening" ? "chair" : "plain"}>
                <p className="whitespace-pre-line leading-relaxed">{m.message}</p>
              </Say>
              {onPin && m.kind === "turn" && (
                <p className="mt-2 text-sm text-muted-foreground">
                  <button type="button" className="border-b border-foreground text-foreground" onClick={() => onPin(m)}>Pin this</button>
                </p>
              )}
            </div>
          </article>
          {missedHere && (
            <p className="border-t border-border py-3 text-sm italic text-muted-foreground">
              {missedHere.names.join(", ")} couldn't give a view in Round {missedHere.round}.
            </p>
          )}
          </React.Fragment>
        );
      })}

      {thinking.map((t) => (
        <article key={`thinking-${t.name}`} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-4 border-t border-border py-4 opacity-90">
          <Portrait name={t.name} libraryKey={t.libraryKey} />
          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline gap-2.5">
              <b className="font-display text-[1.05rem] font-medium">{t.name}</b>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">Round {t.round}</span>
            </div>
            <Say tone="thinking">{t.line}<span className="meeting-dots" aria-hidden="true" /></Say>
          </div>
        </article>
      ))}

      {chairWriting && (
        <article className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-4 border-t border-border py-4">
          <Portrait name={chairWriting.name} libraryKey={chairWriting.libraryKey} />
          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline gap-2.5">
              <b className="font-display text-[1.05rem] font-medium">{chairWriting.name}</b>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">{chairWriting.label}</span>
            </div>
            <Say tone="thinking">{chairWriting.line}<span className="meeting-dots" aria-hidden="true" /></Say>
          </div>
        </article>
      )}
    </section>
  );
}
