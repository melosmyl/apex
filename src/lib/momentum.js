// Momentum and streak utilities.

const MS_PER_DAY = 86400000;

// Absence is never a penalty: past a short grace period, both the (now
// removed) MomentumWidget and the Assistant's welcome-back interjection
// (src/lib/assistant.js) stop implying "you should have been here" and
// switch to welcoming the founder back — still showing the streak they
// already earned rather than a reset "0". Lives here, not in a component
// file, since it's a pure threshold both a UI widget and a headless check
// need to agree on.
export const AWAY_AFTER_DAYS = 2;

/**
 * Collect all activity timestamps from company data, sorted descending.
 */
function collectActivityDates(meetings = [], decisions = [], tasks = [], docs = []) {
  return [
    ...meetings.map((m) => m.created_date),
    ...decisions.map((d) => d.created_date),
    ...tasks.map((t) => t.updated_date || t.created_date),
    ...docs.map((d) => d.created_date),
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));
}

/**
 * Compute activity streaks. Unlike a typical "streak" that zeroes out the
 * moment a day is missed, this never punishes an absence: `current` is the
 * length of the most recent consecutive-day run and holds that value
 * indefinitely (it is not reset by the passage of time, only ever replaced
 * by a new run once activity resumes); `best` is the longest run ever seen.
 * `daysSinceLastActivity` is provided purely for display framing (e.g. a
 * "welcome back" state), never to zero anything out.
 */
export function computeStreak(meetings, decisions, tasks, docs) {
  const dates = collectActivityDates(meetings, decisions, tasks, docs);
  if (!dates.length) return { current: 0, best: 0, daysSinceLastActivity: null };

  // Unique day keys (YYYY-MM-DD), most recent first.
  const dayKeys = [...new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)))];

  // Scan every run of consecutive days to find the most recent run's length
  // and the longest run ever, in one pass over the sorted (desc) day keys.
  let current = 1;
  let best = 1;
  let runLength = 1;
  for (let i = 1; i < dayKeys.length; i++) {
    const prevDay = new Date(dayKeys[i - 1]);
    const thisDay = new Date(dayKeys[i]);
    const diff = Math.round((prevDay.setHours(0, 0, 0, 0) - thisDay.setHours(0, 0, 0, 0)) / MS_PER_DAY);
    if (diff === 1) {
      runLength++;
    } else {
      if (i === runLength) current = runLength; // first break — that run is the "most recent"
      best = Math.max(best, runLength);
      runLength = 1;
    }
  }
  best = Math.max(best, runLength);
  if (current === 1 && dayKeys.length > 0 && runLength === dayKeys.length) current = runLength; // no break at all — one continuous run

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastActivityDay = new Date(dayKeys[0]);
  lastActivityDay.setHours(0, 0, 0, 0);
  const daysSinceLastActivity = Math.round((today - lastActivityDay) / MS_PER_DAY);

  return { current, best, daysSinceLastActivity };
}

/**
 * Count activities in the last N days.
 */
export function countRecentActivity(meetings, decisions, tasks, docs, days = 7) {
  const cutoff = Date.now() - days * MS_PER_DAY;
  const dates = collectActivityDates(meetings, decisions, tasks, docs);
  return dates.filter((d) => new Date(d).getTime() >= cutoff).length;
}

/**
 * Get a momentum label from streak + recent count.
 */
export function momentumLabel(streak, recentCount) {
  if (streak >= 5 || recentCount >= 10) return { label: "On fire", tone: "high" };
  if (streak >= 3 || recentCount >= 5) return { label: "Building momentum", tone: "medium" };
  if (streak >= 1 || recentCount >= 1) return { label: "Getting started", tone: "low" };
  return { label: "Quiet", tone: "idle" };
}