import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCost } from "@/lib/money";
import { meetingAction, betweenSteps, noteStatus, EXTRA_ROUND_USD, MAX_EXTRA_ROUNDS } from "@/lib/boardroom";
import { firstName } from "@/lib/meetingPlayback";

// The founder in the room (Workstream P1): while the meeting runs, the
// founder can add a fact, ask one advisor something, or push back. It goes
// into the next round, and the advisors answer it as they answer each other.
//
// P1.1: the box is pinned to the bottom of the screen and never moves; the
// meeting scrolls behind it, and on a phone it sits above the keyboard. Once
// the founder engages (clicks into it or types), the room keeps pace with
// their screen: the next round waits until they've seen the last one.
// A founder who says nothing sees the meeting run exactly as before.

const SIGNAL_EVERY_MS = 5000;
// Bars on the page now (normally one), so the page's bottom padding is
// cleared only when the last one goes.
let openBars = 0;
const NOTE_LIMIT = 2000;

// How far the on-screen keyboard (or other browser UI) covers the bottom of
// the window, so the bar can sit just above it.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, []);
  return inset;
}

export default function OpenDoor({ meetingId, row, debaters = [], isAnonymous = false, seenRound = 0, besideSidebar = true }) {
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [engaged, setEngaged] = useState(false);
  const lastTyping = useRef(0);
  const carriedOn = useRef(null);
  const barRef = useRef(null);
  const keyboard = useKeyboardInset();

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

  // The whole page keeps room at the bottom for the bar (and the keyboard
  // under it), so everything, footer included, can scroll above it.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const pad = () => { document.body.style.paddingBottom = `${el.offsetHeight + keyboard + 16}px`; };
    const ro = new ResizeObserver(pad);
    openBars += 1;
    ro.observe(el);
    pad();
    return () => {
      ro.disconnect();
      openBars -= 1;
      if (openBars === 0) document.body.style.paddingBottom = "";
    };
  }, [finished, keyboard]);

  // A hold that ran out (nothing sent, or the minute's cap reached while
  // still typing): let the board carry on now rather than wait for the
  // server's own check. Whatever is sent later goes into the next round.
  useEffect(() => {
    if (!betweenSteps(row) || !typingUntil || typingUntil > now) return;
    if (carriedOn.current === row.founder_typing_until) return;
    carriedOn.current = row.founder_typing_until;
    meetingAction(meetingId, "carry_on").catch(() => {});
  }, [row, typingUntil, now, meetingId]);

  // Once engaged, tell the room how far the screen has got, so it keeps
  // pace: at once when a round finishes playing, and every few seconds.
  useEffect(() => {
    if (!engaged || finished || chairBusy) return undefined;
    const signal = () => meetingAction(meetingId, "watching", { seen_round: seenRound }).catch(() => {});
    signal();
    const t = setInterval(signal, SIGNAL_EVERY_MS);
    return () => clearInterval(t);
  }, [engaged, finished, chairBusy, seenRound, meetingId]);

  if (finished) return null;

  const onType = (value) => {
    setEngaged(true);
    setText(value.slice(0, NOTE_LIMIT));
    setError(null);
    if (!value.trim() || chairBusy) return;
    if (Date.now() - lastTyping.current < SIGNAL_EVERY_MS) return;
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

  // Rendered on the page body: the meeting's own containers animate in with
  // a transform, which would otherwise pin a "fixed" bar to them instead of
  // to the screen, so it would move with the minutes.
  return createPortal(
    <section
      ref={barRef}
      aria-label="Add something to the meeting"
      // Below the mobile menu (z-40), which opens over it.
      className={`fixed inset-x-0 bottom-0 z-30 border-t-2 border-foreground bg-card ${besideSidebar ? "lg:left-64" : ""}`}
      style={{ bottom: keyboard, paddingBottom: keyboard ? 0 : "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto max-w-6xl px-5 py-3 sm:px-8">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <b className="font-display text-base font-medium">Add something, or let them carry on</b>
          {error ? <span className="text-sm text-destructive">{error}</span>
            : waiting ? <span className="room-mono">The board is waiting for you</span>
            : null}
        </div>

        {notes.length > 0 && (
          <ul className="mb-2 max-h-20 space-y-1 overflow-y-auto text-sm">
            {notes.map((n) => {
              const s = noteStatus(n, row);
              return (
                <li key={n.id} className="flex flex-wrap gap-x-2">
                  <span className="min-w-0 flex-1 truncate">"{n.text}"{n.to_name ? ` (to ${firstName(n.to_name)})` : ""}</span>
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
              onFocus={() => setEngaged(true)}
              onChange={(e) => onType(e.target.value)}
              rows={2}
              placeholder="A fact they've missed, a question for one of them, or where you disagree."
              className="resize-none bg-background text-base"
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
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
              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <button type="button" className="border-b border-foreground disabled:opacity-50" disabled={!!busy} onClick={() => run("decide")}>
                  {busy === "decide" ? "Asking the Chair…" : "Decide now"}
                </button>
                {!isAnonymous && extra < MAX_EXTRA_ROUNDS && (
                  <button type="button" className="border-b border-foreground disabled:opacity-50" disabled={!!busy} onClick={() => run("more")}>
                    {busy === "more" ? "Adding a round…" : `One more round · about ${formatCost(EXTRA_ROUND_USD)}`}
                  </button>
                )}
                {extra > 0 && <span className="text-muted-foreground">{extra} extra {extra === 1 ? "round" : "rounds"}</span>}
              </span>
            </div>
          </>
        )}
      </div>
    </section>,
    document.body,
  );
}
