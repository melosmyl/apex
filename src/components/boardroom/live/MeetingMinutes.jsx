import { formatCost } from "@/lib/money";
import React from "react";
import { portraitFor } from "@/lib/portraits";
import { initialsOf } from "@/lib/advisorLibrary";
import { turnFlags, countsFor, firstName, shapedTurn } from "@/lib/meetingPlayback";

// "Minutes, as they happen" (meeting mock): each turn as a speech bubble
// beside the advisor's portrait, with what the turn did ("Challenges
// Amara", "Changed position"), filling in as playback reaches it. Advisors
// still writing show as a dashed bubble with their thinking line.

const FLAG_TONE = {
  disagree: "bg-brand text-brand-foreground border-brand",
  agree: "bg-[hsl(var(--sage))] border-foreground",
  changed: "bg-[hsl(var(--live-fill))] border-foreground",
  neutral: "border-foreground",
};

// A shaped turn (Workstream I): whose point it answers, the position and
// its reason up front, and the full turn folded underneath.
function ShapedTurn({ m }) {
  return (
    <div className="space-y-1.5">
      {m.reply_to_advisor && m.answering_point && (
        <p className="font-mono text-[0.72rem] text-muted-foreground">
          Replying to {m.reply_to_advisor === "Founder" ? "you" : firstName(m.reply_to_advisor)}: "{m.answering_point}"
        </p>
      )}
      {m.founder_answer && (
        <p className="leading-relaxed"><b className="font-medium">To you:</b> {m.founder_answer}
          {m.treated_as && <span className="text-sm text-muted-foreground"> · taken as {m.treated_as === "fact" ? "a fact" : "your view"}</span>}</p>
      )}
      <p className="font-medium leading-snug">{m.position}</p>
      {m.because && <p className="leading-relaxed">Why: {m.because}</p>}
      {m.changed_opinion && m.moved_by && (
        <p className="text-sm">Moved by {m.moved_by === "Founder" ? "you" : firstName(m.moved_by)}{m.change_because ? `: ${m.change_because}` : ""}</p>
      )}
      {m.against_me && <p className="text-sm"><b className="font-medium">Against my view:</b> {m.against_me}</p>}
      {m.would_change_my_mind && <p className="text-sm"><b className="font-medium">Would change my mind:</b> {m.would_change_my_mind}</p>}
      {m.message && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">The full turn</summary>
          <p className="mt-1.5 whitespace-pre-line leading-relaxed">{m.message}</p>
        </details>
      )}
    </div>
  );
}

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
        // What the founder said during the meeting (P1): theirs, in the record.
        if (m.kind === "founder") {
          return (
            <article key={i} className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-4 border-t border-border py-4 rise-in">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-foreground font-display text-sm" aria-hidden="true">You</span>
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <b className="font-display text-[1.05rem] font-medium">You</b>
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                    Round {m.round}{m.to_name ? ` · to ${m.to_name}` : " · to the board"}
                  </span>
                </div>
                <p className="whitespace-pre-line leading-relaxed">{m.message}</p>
              </div>
            </article>
          );
        }
        const advisor = advisorsByName[m.advisor_name];
        if (m.unavailable) {
          return (
            <p key={i} className="border-t border-border py-3 text-sm italic text-muted-foreground">
              {m.advisor_name} couldn't give a view in Round {m.round}.
            </p>
          );
        }
        // A change after the founder spoke has its own badge, not a second one.
        const flags = turnFlags(m, participants).filter((f) => !(m.after_founder_pushback && /chang/i.test(f.label)));
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
                {Number.isFinite(m.cost_usd) && (
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">{formatCost(m.cost_usd)}</span>
                )}
                {m.after_founder_pushback && (
                  <span className="rounded-full border-[1.5px] border-foreground px-2 py-px font-mono text-[0.58rem] uppercase tracking-[0.12em]">
                    {Array.isArray(m.flags) && m.flags.includes("change_without_reason") ? "Gave way after you spoke, no new reason" : "Changed after you spoke"}
                  </span>
                )}
                {m.redone_after && (
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground" title={`The first answer was almost the same as ${m.redone_after}'s, so it was asked again`}>Asked again</span>
                )}
                {m.challenger && (
                  <span className="rounded-full border-[1.5px] border-foreground px-2 py-px font-mono text-[0.58rem] uppercase tracking-[0.12em]">Challenger</span>
                )}
                {flags.map((f) => (
                  <span key={f.label} className={`rounded-full border-[1.5px] px-2 py-px font-mono text-[0.58rem] uppercase tracking-[0.12em] ${FLAG_TONE[f.tone]}`}>{f.label}</span>
                ))}
              </div>
              <Say tone={m.kind === "opening" ? "chair" : "plain"}>
                {m.kind === "turn" && shapedTurn(m) ? <ShapedTurn m={m} /> : <p className="whitespace-pre-line leading-relaxed">{m.message}</p>}
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
