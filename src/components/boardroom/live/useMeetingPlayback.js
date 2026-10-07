import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dwellMs, playbackItems } from "@/lib/meetingPlayback";

// Plays a meeting's turns back one at a time as they arrive (see
// src/lib/meetingPlayback.js for why). Returns what's been revealed, who has
// the floor right now, and a way to skip to the end.
export default function useMeetingPlayback({ chairOpening, chairName, transcript, phase }) {
  const items = useMemo(() => playbackItems(chairOpening, chairName, transcript), [chairOpening, chairName, transcript]);
  const [revealed, setRevealed] = useState(0);
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
