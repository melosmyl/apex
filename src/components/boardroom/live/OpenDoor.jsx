import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCost } from "@/lib/money";
import { meetingAction, betweenSteps, noteStatus, EXTRA_ROUND_USD, MAX_EXTRA_ROUNDS } from "@/lib/boardroom";
import { firstName } from "@/lib/meetingPlayback";

// The founder in the room (Workstream P1): while the meeting runs, the
// founder can add a fact, ask one advisor something, or push back. It goes
// into the next round, and the advisors answer it as they answer each other.
// The meeting waits for them only while they're typing as a round ends.
// A founder who says nothing sees the meeting run exactly as before.

const TYPING_EVERY_MS = 5000;
const NOTE_LIMIT = 2000;

export default function OpenDoor({ meetingId, row, debaters = [], isAnonymous = false }) {
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const lastTyping = useRef(0);
  const carriedOn = useRef(null);

  const status = row?.status;
  const chairBusy = status === "synthesizing" || !!row?.decide_now;
  const finished = ["complete", "failed", "superseded"].includes(status);
  const extra = row?.extra_rounds || 0;
  const typingUntil = row?.founder_typing_until ? new Date(row.founder_typing_until).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const waiting = betweenSteps(row) && typingUntil > now;

  // A hold that ran out (nothing sent, or the minute's cap reached while
  // still typing): let the board carry on now rather than wait for the
  // server's own check. Whatever is sent later goes into the next round.
  useEffect(() => {
    if (!betweenSteps(row) || !typingUntil || typingUntil > now) return;
    if (carriedOn.current === row.founder_typing_until) return;
    carriedOn.current = row.founder_typing_until;
    meetingAction(meetingId, "carry_on").catch(() => {});
  }, [row, typingUntil, now, meetingId]);

  if (finished) return null;

  const onType = (value) => {
    setText(value.slice(0, NOTE_LIMIT));
    setError(null);
    if (!value.trim() || chairBusy) return;
    if (Date.now() - lastTyping.current < TYPING_EVERY_MS) return;
    lastTyping.current = Date.now();
    meetingAction(meetingId, "typing").catch(() => {});
  };

  const run = async (action, extraBody) => {
    setBusy(action); setError(null);
    try {
      await meetingAction(meetingId, action, extraBody);
      if (action === "note") { setText(""); lastTyping.current = 0; }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const notes = row?.founder_notes || [];

  return (
    <section className="mt-6 rounded-md border-2 border-foreground bg-card p-4 sm:p-5" aria-label="Add something to the meeting">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <b className="font-display text-lg font-medium">Add something, or let them carry on</b>
        {waiting && <span className="room-mono">The board is waiting for you</span>}
      </div>

      {notes.length > 0 && (
        <ul className="mb-3 space-y-1.5 text-sm">
          {notes.map((n) => {
            const s = noteStatus(n, row);
            return (
              <li key={n.id} className="flex flex-wrap gap-x-2">
                <span className="min-w-0 flex-1">"{n.text}"{n.to_name ? ` (to ${firstName(n.to_name)})` : ""}</span>
                <span className="room-mono text-muted-foreground">{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {chairBusy ? (
        <p className="text-sm text-muted-foreground">The Chair is writing up the resolution. You can ask the board more once it's ready.</p>
      ) : (
        <>
          <Textarea
            id="open-door-note"
            value={text}
            onChange={(e) => onType(e.target.value)}
            rows={2}
            placeholder="A fact they've missed, a question for one of them, or where you disagree."
            className="resize-none bg-background text-base"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="open-door-to">Who it's for</label>
            <select id="open-door-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">To the board</option>
              {debaters.map((d) => <option key={d.id} value={d.id}>To {firstName(d.name)}</option>)}
            </select>
            <Button variant="primary" disabled={!text.trim() || !!busy} onClick={() => run("note", { text: text.trim(), to_advisor_id: to || undefined })}>
              {busy === "note" ? "Sending…" : "Send to the board"}
            </Button>
            {waiting && !text.trim() && (
              <Button variant="secondaryOutline" disabled={!!busy} onClick={() => run("carry_on")}>Carry on</Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">What you say goes into the next round and is kept as something you told the board.</p>
        </>
      )}

      {!chairBusy && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
          <button type="button" className="border-b border-foreground disabled:opacity-50" disabled={!!busy} onClick={() => run("decide")}>
            {busy === "decide" ? "Asking the Chair…" : "Decide now"}
          </button>
          {!isAnonymous && extra < MAX_EXTRA_ROUNDS && (
            <button type="button" className="border-b border-foreground disabled:opacity-50" disabled={!!busy} onClick={() => run("more")}>
              {busy === "more" ? "Adding a round…" : `One more round · about ${formatCost(EXTRA_ROUND_USD)}`}
            </button>
          )}
          {extra > 0 && <span className="text-muted-foreground">{extra} extra {extra === 1 ? "round" : "rounds"} asked for</span>}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
