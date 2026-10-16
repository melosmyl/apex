import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCost } from "@/lib/money";
import { meetingAction, noteStatus, EXTRA_ROUND_USD, MAX_EXTRA_ROUNDS } from "@/lib/boardroom";
import { firstName } from "@/lib/meetingPlayback";

// "Sit in" (owner, 15 October 2026): the meeting stops after every round and
// waits for the founder. They read at their own pace, then add a fact, ask
// one advisor something or push back (answered first in the next round), or
// press Carry on. Nothing moves until they do. After the last round a note
// gets one more round, so the board answers it, while extra rounds are left.
//
// The box is pinned to the bottom of the screen and never moves; the meeting
// scrolls behind it, and on a phone it sits above the keyboard. Only Sit in
// meetings have it: "Ask the board" (Quick) is today's meeting, untouched.

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

export default function OpenDoor({ meetingId, row, debaters = [], isAnonymous = false, besideSidebar = true, maxRounds = 3 }) {
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const barRef = useRef(null);
  const keyboard = useKeyboardInset();

  const status = row?.status;
  const chairBusy = status === "synthesizing" || !!row?.decide_now;
  const finished = ["complete", "failed", "superseded"].includes(status);
  const extra = row?.extra_rounds || 0;
  // Sit in: the board has stopped and waits for the founder.
  const yourTurn = !!row?.waiting_for_founder && !chairBusy;
  const lastRoundDone = status === "discussion_complete";
  const roundsLeft = !isAnonymous && extra < MAX_EXTRA_ROUNDS && !row?.decide_now;
  // The planned rounds' last one is being written: a note sent now misses it.
  const target = Number.isInteger(row?.rounds_target) ? row.rounds_target : maxRounds;
  const lastRoundRunning = status === "discussing" && !row?.waiting_for_founder && (row?.discussion_rounds_completed || 0) + 1 >= target;
  // Notes no round has answered yet: at the last stop, carrying on gives
  // them one more round (while extra rounds are left).
  const heard = new Set((row?.discussion_transcript || []).map((x) => x.note_id).filter(Boolean));
  const unheard = (row?.founder_notes || []).filter((n) => !heard.has(n.id) && !n.withdrawn_at && !n.before_meeting);

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

  if (finished) return null;

  const run = async (action, extraBody) => {
    setBusy(action); setError(null);
    try {
      await meetingAction(meetingId, action, extraBody);
      if (action === "note") setText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Where a note goes from here, in plain words.
  const whereItGoes = status === "preparing" ? "It goes to the board at the first stop."
    : (lastRoundDone || lastRoundRunning) && !roundsLeft ? "It goes to the Chair for the decision."
    : row?.turn_shape && unheard.length ? "One note goes into each round: this one waits for the round after your earlier note."
    : !(lastRoundDone || lastRoundRunning) ? "The board answers it first in the next round."
    : lastRoundDone ? `The board answers it in one more round (about ${formatCost(EXTRA_ROUND_USD)}).`
    : `This is the board's last planned round. When it stops, carry on and they answer it in one more round (about ${formatCost(EXTRA_ROUND_USD)}).`;
  const notes = (row?.founder_notes || []).filter((n) => !n.before_meeting);

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
          <b className="font-display text-base font-medium">
            {chairBusy ? "The Chair is writing up" : yourTurn ? (lastRoundDone ? "Your turn: the board has finished its rounds" : "Your turn") : "The board is writing"}
          </b>
          {error ? <span className="text-sm text-destructive">{error}</span>
            : !chairBusy ? <span className="room-mono">{yourTurn ? "Nothing moves until you do" : "You can write while they do"}</span>
            : null}
        </div>

        {status === "preparing" && (
          <p className="mb-2 text-sm text-muted-foreground">Round 1 is blind: each advisor answers alone. Your note goes to the board at the first stop.</p>
        )}

        {notes.length > 0 && (
          <ul className="mb-2 max-h-20 space-y-1 overflow-y-auto text-sm">
            {notes.map((n) => {
              const s = noteStatus(n, row);
              return (
                <li key={n.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`min-w-0 flex-1 truncate ${n.withdrawn_at ? "text-muted-foreground line-through" : ""}`}>"{n.text}"{n.to_name ? ` (to ${firstName(n.to_name)})` : ""}</span>
                  <span className="room-mono text-muted-foreground">{s.label}</span>
                  {/* Not heard yet: it can be taken back, and never reaches the board. */}
                  {!s.done && !chairBusy && (
                    <button type="button" className="border-b border-foreground text-xs disabled:opacity-50" disabled={!!busy}
                      onClick={() => run("withdraw", { note_id: n.id })}>
                      {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
                    </button>
                  )}
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
              onChange={(e) => { setText(e.target.value.slice(0, NOTE_LIMIT)); setError(null); }}
              rows={2}
              placeholder={`A fact they've missed, a question for one of them, or where you disagree. ${whereItGoes}`}
              className="resize-none bg-background text-base"
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="sr-only" htmlFor="open-door-to">Who it's for</label>
              <select id="open-door-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">To the board</option>
                {debaters.map((d) => <option key={d.id} value={d.id}>To {firstName(d.name)}</option>)}
              </select>
              <Button variant={text.trim() ? "primary" : "secondaryOutline"} disabled={!text.trim() || !!busy} onClick={() => run("note", { text: text.trim(), to_advisor_id: to || undefined })}>
                {busy === "note" ? "Sending…" : "Send to the board"}
              </Button>
              {yourTurn && (
                <Button variant={text.trim() ? "secondaryOutline" : "primary"} disabled={!!busy}
                  onClick={() => run("carry_on", { at: { status, rounds: row?.discussion_rounds_completed || 0 } })}>
                  {busy === "carry_on" ? "Carrying on…" : !lastRoundDone ? "Carry on"
                    : unheard.length && roundsLeft ? `Carry on: one more round for your note · about ${formatCost(EXTRA_ROUND_USD)}` : "Carry on to the decision"}
                </Button>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <button type="button" className="border-b border-foreground disabled:opacity-50" disabled={!!busy} onClick={() => run("decide")}>
                  {busy === "decide" ? "Asking the Chair…" : "Decide now"}
                </button>
                {/* Before the last round, Carry on already runs the next one. */}
                {roundsLeft && lastRoundDone && (
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
