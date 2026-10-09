import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dwellMs, playbackItems } from "@/lib/meetingPlayback";

// Plays a meeting's turns back one at a time as they arrive (see
// src/lib/meetingPlayback.js for why). Returns what's been revealed, who has
// the floor right now, and a way to skip to the end.
// A turn's identity: the opening, or who spoke in which round. Round 1
// answers arrive one by one, in any order, and the transcript is replaced
// as they do; keying by identity keeps the playback order fixed.
const keyOf = (i) => (i.kind === "opening" ? "opening" : `${i.round}:${i.advisor_id || i.advisor_name}`);

export default function useMeetingPlayback({ chairOpening, chairName, transcript, phase }) {
  // Append-only: a turn keeps its place once seen, so nothing already
  // played back moves when new turns land.
  const order = useRef([]);
  const revealedRef = useRef(0);
  const items = useMemo(() => {
    const candidates = playbackItems(chairOpening, chairName, transcript);
    const byKey = new Map(candidates.map((c) => [keyOf(c), c]));
    for (const k of byKey.keys()) {
      if (order.current.includes(k)) continue;
      // An opening that lands after some Round 1 turns have played goes
      // next in line, not to the back: the Chair still opens.
      if (k === "opening") order.current.splice(Math.min(revealedRef.current, order.current.length), 0, k);
      else order.current.push(k);
    }
    return order.current.map((k) => byKey.get(k)).filter(Boolean);
  }, [chairOpening, chairName, transcript]);
  const [revealed, setRevealed] = useState(0);
  revealedRef.current = revealed;
  // Whether the latest revealed turn still holds the floor.
  const [floor, setFloor] = useState(false);
  const latest = useRef({ items, phase });
  latest.current = { items, phase };

  // Something new to show and nobody holding the floor: reveal the next turn.
  // Before paint, so a landing round never flashes an empty floor. An advisor
  // whose call failed is noted in the minutes but never given the floor.
  useLayoutEffect(() => {
    if (floor || revealed >= items.length) return;
    const next = items[revealed];
    setRevealed((r) => (r === revealed ? r + 1 : r));
    setFloor(!next.unavailable);
  }, [floor, revealed, items]);

  // The current turn holds the floor for its dwell time, then hands over:
  // straight to the next turn if one has arrived, otherwise the floor clears.
  // Keyed to the turn, not to new arrivals, so a round landing mid-turn
  // doesn't restart the current speaker's time.
  useEffect(() => {
    if (!floor || revealed === 0) return undefined;
    const { items: now, phase: p } = latest.current;
    const dwell = dwellMs(now[revealed - 1], {
      queued: now.length - revealed,
      finishing: p === "resolution" || p === "result",
    });
    const t = setTimeout(() => {
      const { items: after } = latest.current;
      if (revealed < after.length && !after[revealed].unavailable) {
        setRevealed((r) => (r === revealed ? r + 1 : r));
      } else {
        setFloor(false);
      }
    }, dwell);
    return () => clearTimeout(t);
  }, [floor, revealed]);

  const skip = () => {
    setRevealed(items.length);
    setFloor(false);
  };

  const speaking = floor && revealed > 0 && !items[revealed - 1]?.unavailable ? items[revealed - 1] : null;
  return { items, revealed, speaking, caughtUp: revealed >= items.length && !floor, skip };
}
