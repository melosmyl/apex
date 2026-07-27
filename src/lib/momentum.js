// Momentum, time-saved, and milestone utilities for Stage 2.

// Estimated minutes saved per activity — replaces manual human effort.
const TIME_SAVED_PER_ACTIVITY = {
  meeting: 120,   // convening + running a real board meeting
  decision: 60,    // research + deliberation + writing a decision memo
  task_done: 45,   // advisor executing a deliverable
  document: 90,    // drafting a document from scratch
};

const MS_PER_DAY = 86400000;

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
 * Compute the current activity streak (consecutive days with ≥1 activity).
 */
export function computeStreak(meetings, decisions, tasks, docs) {
  const dates = collectActivityDates(meetings, decisions, tasks, docs);
  if (!dates.length) return 0;

  // Unique day keys (YYYY-MM-DD), most recent first.
  const dayKeys = [...new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)))];

  let streak = 0;
  let cursor = new Date();
  // Allow today OR yesterday as the start of a streak (grace period).
  const lastActivityDay = new Date(dayKeys[0]);
  const dayDiff = Math.floor((cursor.setHours(0, 0, 0, 0) - new Date(dayKeys[0]).setHours(0, 0, 0, 0)) / MS_PER_DAY);
  if (dayDiff > 1) return 0; // last activity was more than 1 day ago — streak broken

  cursor = new Date(dayKeys[0]);
  for (const dayKey of dayKeys) {
    const activityDay = new Date(dayKey);
    const diff = Math.floor((cursor.setHours(0, 0, 0, 0) - activityDay.setHours(0, 0, 0, 0)) / MS_PER_DAY);
    if (diff === 0) {
      streak++;
      cursor = new Date(activityDay);
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
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
 * Compute total estimated time saved (in minutes) from company activity.
 */
export function computeTimeSaved(meetings = [], decisions = [], tasks = [], docs = []) {
  const doneTasks = tasks.filter((t) => t.status === "done");
  return (
    meetings.length * TIME_SAVED_PER_ACTIVITY.meeting +
    decisions.length * TIME_SAVED_PER_ACTIVITY.decision +
    doneTasks.length * TIME_SAVED_PER_ACTIVITY.task_done +
    docs.length * TIME_SAVED_PER_ACTIVITY.document
  );
}

/**
 * Format minutes into a human-readable duration.
 */
export function formatTimeSaved(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 8) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 8);
  const remHours = hours % 8;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
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