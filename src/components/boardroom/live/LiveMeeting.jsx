import React, { useEffect, useMemo, useState } from "react";
import useMeetingPlayback from "@/components/boardroom/live/useMeetingPlayback";
import MeetingStage from "@/components/boardroom/live/MeetingStage";
import SeatRow from "@/components/boardroom/live/SeatRow";
import MeetingProgress from "@/components/boardroom/live/MeetingProgress";
import MeetingMinutes from "@/components/boardroom/live/MeetingMinutes";
import { MAX_ROUNDS, excerpt, firstName, progressSteps, thinkingLineFor, turnFlags } from "@/lib/meetingPlayback";
import { absenteesByRound } from "@/lib/boardroom";

// A meeting in session, laid out as the owner's meeting mock, showing only
// what the engine really does (option A, see src/lib/meetingPlayback.js).

// How long Round 1 answers wait for the Chair's opening before playing.
const OPENING_GRACE_MS = 8000;

const whenFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function LiveMeeting({
  phase, question, startedAt, chair, debaters, seatAssignment, transcript, chairOpening, advisors,
  maxRounds = MAX_ROUNDS, onOpenProfile, onPin, onFinished,
}) {
  // The opening plays first. Round 1 answers that arrive before it wait up
  // to a few seconds for it, then play anyway (an opening that fails never
  // holds the meeting up).
  const [openingGrace, setOpeningGrace] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOpeningGrace(false), OPENING_GRACE_MS);
    return () => clearTimeout(t);
  }, []);
  const shownTranscript = chairOpening || !openingGrace || phase !== "preparing" ? transcript : [];
  const playback = useMeetingPlayback({ chairOpening, chairName: chair.name, transcript: shownTranscript, phase });

  // How long Round 1 has been forming, for the "usually under a minute" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "preparing") return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt.getTime()) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const { items, revealed, speaking, caughtUp } = playback;
  const chairFirst = firstName(chair.name);

  // A finished meeting moves on to its result once playback has caught up.
  useEffect(() => {
    if (phase === "result" && caughtUp) onFinished?.();
  }, [phase, caughtUp, onFinished]);

  const latestRound = items.reduce((r, i) => (i.kind === "turn" ? Math.max(r, i.round) : r), 0);
  const pendingRound =
    phase === "preparing" ? 1 :
    phase === "discussion" && latestRound < maxRounds ? latestRound + 1 :
    null;

  const advisorsByName = useMemo(() => Object.fromEntries(advisors.map((a) => [a.name, a])), [advisors]);
  const debaterNames = debaters.map((d) => d.name);
  const participants = [chair.name, ...debaterNames, ...transcript.map((m) => m.advisor_name).filter(Boolean)];

  const stateFor = (name) => {
    if (speaking?.advisor_name === name && speaking.kind === "turn") return "speaking";
    const idx = items.findIndex((i, n) => n >= revealed && i.kind === "turn" && !i.unavailable && i.advisor_name === name);
    if (idx >= 0) return "up_next";
    if (pendingRound && !items.some((i) => i.kind === "turn" && i.round === pendingRound && i.advisor_name === name)) return "thinking";
    const mine = items.slice(0, revealed).filter((i) => i.advisor_name === name);
    if (mine.some((i) => !i.unavailable)) return "spoke";
    if (mine.length) return "absent";
    return "waiting";
  };

  const chairState =
    speaking?.kind === "opening" ? "speaking" :
    (phase === "preparing" && !chairOpening) || phase === "resolution" ? "writing" :
    "chairing";

  const seats = Object.entries(seatAssignment)
    .map(([name, chairId]) => {
      const isChair = name === chair.name;
      const a = isChair ? chair : advisorsByName[name];
      return {
        chairId, name, shortName: firstName(name), role: a?.role, libraryKey: a?.library_key, isChair,
        state: isChair ? chairState : debaterNames.includes(name) ? stateFor(name) : "waiting",
      };
    })
    .sort((a, b) => (a.isChair ? -1 : b.isChair ? 1 : 0));

  const litChairId =
    speaking ? seatAssignment[speaking.advisor_name] :
    chairState === "writing" ? seatAssignment[chair.name] :
    null;

  let bubble;
  if (speaking?.kind === "opening") {
    bubble = { label: `Opening · ${chair.name}`, text: excerpt(speaking.message) };
  } else if (speaking) {
    const flag = turnFlags(speaking, participants)[0];
    bubble = {
      label: `${speaking.advisor_name} · Round ${speaking.round}${flag ? ` · ${flag.label.charAt(0).toLowerCase()}${flag.label.slice(1)}` : ""}`,
      text: excerpt(speaking.message),
    };
  } else if (phase === "preparing" && !chairOpening && elapsed < 60) {
    bubble = { label: `Opening · ${clock}`, text: `${chairFirst} is opening the meeting while the board writes its first positions. Round 1 usually takes under a minute.` };
  } else if (phase === "preparing" && elapsed >= 60) {
    const still = seats.filter((s) => s.state === "thinking").map((s) => s.shortName);
    bubble = {
      label: `Round 1 · ${clock}`,
      text: still.length
        ? `Taking longer than usual: ${still.join(" and ")} ${still.length === 1 ? "is" : "are"} still writing. Answers play here as they arrive.`
        : "Taking longer than usual. Answers play here as they arrive.",
    };
  } else if (phase === "preparing") {
    bubble = { label: `Round 1 · ${clock}`, text: "The board is writing its first positions, each on their own. Round 1 usually takes under a minute; answers play here as they arrive." };
  } else if (pendingRound) {
    bubble = { label: `Round ${pendingRound}`, text: "Everyone writes this round at the same time. Their turns play back here as they arrive." };
  } else if (phase === "resolution") {
    bubble = { label: "Resolution", text: `${chairFirst} is writing up the resolution.` };
  } else if (phase === "result") {
    bubble = { label: "Resolution", text: "The resolution is ready." };
  }

  const steps = progressSteps({ phase, items, revealed, speaking, pendingRound, chairName: chairFirst, maxRounds });
  const nowStep = steps.find((s) => s.status === "now");
  const pill = nowStep?.key === "resolution" ? "Resolution" : nowStep?.round ? `Round ${nowStep.round} of ${maxRounds}` : "Opening";

  // Advisors whose call failed in a later round: the engine drops them, so
  // the minutes say so once that round has played back.
  const lastShownRound = items.slice(0, revealed).reduce((r, i) => (i.kind === "turn" ? Math.max(r, i.round) : r), 0);
  const fullyShown = (round) => !items.some((i, n) => n >= revealed && i.kind === "turn" && i.round === round);
  const missed = Object.entries(absenteesByRound(transcript, chair.name))
    .filter(([round]) => Number(round) <= lastShownRound && fullyShown(Number(round)))
    .map(([round, names]) => ({ round: Number(round), names: names.filter((n) => debaterNames.includes(n)) }))
    .filter((x) => x.names.length);

  const thinking = seats
    .filter((s) => s.state === "thinking")
    .map((s) => ({ name: s.name, libraryKey: s.libraryKey, round: pendingRound, line: thinkingLineFor(advisorsByName[s.name] || s) }));
  const chairWriting =
    chairState !== "writing" ? null :
    phase === "resolution"
      ? { name: chair.name, libraryKey: chair.library_key, label: "Resolution", line: `${chairFirst} is writing up the resolution.` }
      : { name: chair.name, libraryKey: chair.library_key, label: "Opening", line: `${chairFirst} is opening the meeting.` };

  const open = (who) => {
    const name = typeof who === "string" ? who : who.name;
    const a = name === chair.name ? chair : advisorsByName[name];
    onOpenProfile?.({ advisor: a?.id ? a : undefined, name, libraryKey: a?.library_key, role: a?.role });
  };

  return (
    <div className="rise-in">
      <div className="mb-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className="room-mono">Meeting in session{startedAt ? ` · ${whenFmt.format(startedAt)}` : ""}</span>
          <p className="mt-1 max-w-[40rem] font-display text-[1.6rem] font-light leading-tight tracking-[-0.02em] text-balance sm:text-[2.1rem]">{question}</p>
        </div>
        <span className="room-pill shrink-0 self-start !bg-[hsl(var(--live-fill))]">
          <span className="meeting-live-dot" aria-hidden="true" />
          {pill}
        </span>
      </div>

      <MeetingProgress steps={steps} />

      <MeetingStage seats={seats} litChairId={litChairId} onOpen={open} />
      <SeatRow seats={seats} bubble={bubble} onOpen={open} />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>Advisors write each round at the same time; their turns play back as they arrive.</span>
        {!caughtUp && revealed < items.length && (
          <button type="button" onClick={playback.skip} className="border-b border-foreground text-foreground">
            {phase === "result" ? "Read the resolution now" : "Skip to the latest"}
          </button>
        )}
        {phase === "result" && caughtUp === false && revealed >= items.length && (
          <button type="button" onClick={onFinished} className="border-b border-foreground text-foreground">Read the resolution now</button>
        )}
      </div>

      <MeetingMinutes
        items={items}
        revealed={revealed}
        thinking={thinking}
        chairWriting={chairWriting}
        advisorsByName={{ ...advisorsByName, [chair.name]: chair }}
        participants={participants}
        missed={missed}
        onPin={onPin}
        onOpen={open}
      />
    </div>
  );
}
