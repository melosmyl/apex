// The live meeting view's honest playback (Workstream L, owner's option A).
//
// The engine runs a round with every advisor writing at the same moment, and
// saves the round when they've all finished; nobody hears anyone else until
// the next round. So the screen never pretends one advisor is speaking while
// another waits to reply. Instead: while a round is being written, everyone
// in it is "thinking"; when the round lands, its turns play back one at a
// time (the lamp and the speech bubble walk through them), and the minutes
// fill in as they do. The Chair's opening plays first.

import { libraryAdvisorFor } from "@/lib/advisorProfiles";

// The most rounds a discussion can run (system_limits.max_discussion_rounds,
// default 3: Round 1 positions, then up to two of discussion). The engine can
// stop after Round 2 when nobody moves, which the progress bar shows.
export const MAX_ROUNDS = 3;

// How long a turn holds the floor in playback: long enough to read the
// bubble's excerpt, but shorter when turns are queued up behind it or the
// meeting has already finished, so the screen keeps pace with the engine
// (a round of five lands at once; the founder shouldn't wait a minute more
// for the result than the engine took).
export function dwellMs(item, { queued = 0, finishing = false } = {}) {
  if (item?.kind === "founder") return 1500;
  const chars = spokenText(item).length;
  const base = Math.min(7000, Math.max(3000, 1500 + chars * 20));
  if (finishing || queued >= 3) return Math.min(base, 2500);
  if (queued >= 1) return Math.min(base, 4500);
  return base;
}

// A turn as [what it says, its reason]: a shaped turn's position and
// reason, a Round 1 position written with its reason (turn shape on), or
// anything else as it is with no reason, so it shows exactly as before.
export function splitWhy(m) {
  if (!m) return ["", null];
  if (shapedTurn(m)) return [m.position, m.because || null];
  const t = String(m.message || "");
  const i = m.round === 1 && m.message_type === "initial" ? t.indexOf("\nWhy: ") : -1;
  return i > 0 ? [t.slice(0, i), t.slice(i + 6)] : [t, null];
}

// What a turn says out loud while it plays: a shaped turn (Workstream I)
// leads with its position and reason, the full turn sits in the minutes.
export function shapedTurn(m) {
  return !!(m?.position && m.round > 1);
}
export function spokenText(m) {
  const [said, why] = splitWhy(m);
  return why ? `${said} ${why}` : said;
}

// Everything that plays back, in order: the opening, then each turn.
export function playbackItems(chairOpening, chairName, transcript = []) {
  const items = [];
  if (chairOpening) items.push({ kind: "opening", round: 0, advisor_name: chairName, message: chairOpening });
  for (const m of transcript) {
    // What the founder said during the meeting (P1) plays in its place;
    // follow-ups after the resolution don't belong in the live meeting.
    if (m.message_type === "founder_message") {
      if (m.note_id) items.push({ kind: "founder", ...m });
      continue;
    }
    // The Chair putting the founder's note to the board (turn shape on).
    if (m.message_type === "chair_tabling") {
      items.push({ kind: "chair", ...m });
      continue;
    }
    items.push({ kind: "turn", ...m });
  }
  return items;
}

// The model writes reply_to_advisor and agrees_with as free text; a flag
// only names someone actually in the meeting ("the board" names nobody).
function participantNamed(value, participants = []) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  return participants.find((p) => p.toLowerCase() === v || firstName(p).toLowerCase() === v) || null;
}

// What a turn did, from the fields the engine actually records. No pronouns:
// advisors have none in the data.
export function turnFlags(msg, participants = []) {
  if (!msg || msg.kind !== "turn" || msg.unavailable) return [];
  const flags = [];
  const self = msg.advisor_name;
  const target = participantNamed(msg.reply_to_advisor, participants);
  const ally = participantNamed(msg.agrees_with, participants);
  // The advisor's own label of the move ("challenge", "rebuttal"), worded as
  // the move, not as a verdict: models label turns loosely, and a turn that
  // also records agreeing with the same person isn't shown as a challenge.
  const checks = Array.isArray(msg.flags) ? msg.flags : [];
  // A shaped turn says what it does with whose point.
  if (msg.stance && target && target !== self) {
    const verb = { disagree: "Disagrees with", build: "Builds on", question: "Questions", agree: "Agrees with" }[msg.stance];
    if (verb) flags.push({ tone: msg.stance === "disagree" ? "disagree" : msg.stance === "agree" ? "agree" : "neutral", label: `${verb} ${firstName(target)}` });
  } else {
    if (["challenge", "rebuttal"].includes(msg.message_type) && target && target !== self && target !== ally) {
      flags.push({ tone: "disagree", label: `${msg.message_type === "rebuttal" ? "Rebuts" : "Challenges"} ${firstName(target)}` });
    }
    if (ally && ally !== self) flags.push({ tone: "agree", label: `Agrees with ${firstName(ally)}` });
  }
  // A change that names no reason isn't shown as one (the Chair counts the
  // earlier position).
  if (msg.changed_opinion && !checks.includes("change_without_reason")) flags.push({ tone: "changed", label: "Changed position" });
  return flags;
}

export function countsFor(items, participants = []) {
  const turns = items.filter((i) => i.kind === "turn" && !i.unavailable);
  return {
    challenges: turns.filter((m) => turnFlags(m, participants).some((f) => f.tone === "disagree")).length,
    changed: turns.filter((m) => m.changed_opinion && !(Array.isArray(m.flags) && m.flags.includes("change_without_reason"))).length,
  };
}

export function firstName(name = "") {
  return String(name).replace(/^Dr\.\s+/, "").split(" ")[0];
}

// A bubble-sized excerpt: whole sentences up to about `max` characters, or a
// clean cut at a word.
export function excerpt(text = "", max = 240) {
  const t = String(text).trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

// The line shown while an advisor writes: their own for library advisors,
// a plain one for anyone else.
export function thinkingLineFor(advisor) {
  const lib = advisor ? libraryAdvisorFor({ libraryKey: advisor.library_key, name: advisor.name }) : null;
  // A renamed library advisor gets the plain line: the library's names theirs.
  if (lib?.thinking_line && lib.name === advisor.name) return lib.thinking_line;
  return `${firstName(advisor?.name)} is thinking.`;
}

const ROUND_STEP_LABEL = (r) => `Round ${r}`;

// The five steps of the progress bar, and which one the meeting is on.
// `stage` comes from the playback: { phase, revealedItems, speaking, pendingRound, resolutionReady }.
export function progressSteps({ phase, items, revealed, speaking, pendingRound, chairName, maxRounds = MAX_ROUNDS }) {
  const shown = items.slice(0, revealed);
  const landedRounds = new Set(items.filter((i) => i.kind === "turn" && !i.unavailable).map((i) => i.round));
  const roundOneCount = items.filter((i) => i.kind === "turn" && i.round === 1 && !i.unavailable).length;
  const resolutionStage = phase === "resolution" || phase === "result";

  let current;
  if (speaking) current = speaking.kind === "opening" ? 0 : speaking.round;
  else if (resolutionStage && revealed >= items.length) current = maxRounds + 1;
  // Before anything lands the Chair is opening, and playback starts with her.
  else if (phase === "preparing" && !shown.length) current = 0;
  else if (pendingRound) current = pendingRound;
  else if (shown.length) current = shown[shown.length - 1].kind === "opening" ? 0 : shown[shown.length - 1].round;
  else current = 0;

  // Never step backwards: a late opening playing after Round 1 turns keeps
  // the bar on Round 1.
  const furthestShown = shown.reduce((m, i) => Math.max(m, i.kind === "opening" ? 0 : i.round), 0);
  current = Math.max(current, Math.min(furthestShown, maxRounds));

  const steps = [{ key: "opening", label: "Opening", sub: chairName }];
  for (let r = 1; r <= maxRounds; r++) {
    let sub;
    if (r === 1) sub = roundOneCount ? `${roundOneCount} positions` : "Positions forming";
    else if (r === maxRounds) sub = "Closing statements";
    else sub = current === r ? "Debating now" : "Responses";
    steps.push({ key: `round-${r}`, label: ROUND_STEP_LABEL(r), sub, round: r });
  }
  steps.push({ key: "resolution", label: "Resolution", sub: `${chairName} writes it up` });

  return steps.map((s, i) => {
    let status = i < current ? "done" : i === current ? "now" : "next";
    // A round the engine didn't need: the discussion settled early.
    if (s.round && s.round > 1 && resolutionStage && !landedRounds.has(s.round)) {
      return { ...s, status: "skipped", sub: "Skipped: the discussion ended early" };
    }
    return { ...s, status };
  });
}
