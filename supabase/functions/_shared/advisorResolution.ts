// The Chair's free-text `assigned_to` (from next_actions / task.assigned_to)
// is not a reliable identifier — sometimes a real advisor's name, sometimes
// a role descriptor ("Head of Growth"), sometimes a fabricated team that
// doesn't exist in this product ("Supply Chain Team") since it's built for
// solo/small founders, not org charts. This resolves it to a real advisor
// so a specific voice can be attributed, rather than silently failing (or
// misattributing) whenever it isn't an exact name match.
//
// Shared between task creation (runChairSynthesis, attributing a
// commitment to the advisor who raised it) and task-completion
// acknowledgment (acknowledgeTaskCompletion, picking who responds when a
// task is marked done) so both resolve identically instead of drifting.
import { findChair } from './chair.ts';

// deno-lint-ignore no-explicit-any
type Advisor = any;

// Words that say nothing about which role is meant.
const FILLER = new Set(['the', 'our', 'your', 'head', 'lead', 'chief', 'and', 'of', 'to', 'for', 'me', 'my', 'in', 'on', 'at', 'an']);

const firstName = (name: string) => String(name || '').replace(/^Dr\.?\s+/i, '').split(/\s+/)[0].toLowerCase();

const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// The advisor a label names by name: exactly, by full name inside a longer
// label ("Grace Okafor (Customer Advocate)", "Marcus Webb – research lead"),
// or by a first name only one advisor has ("Grace").
export function matchAdvisorByName(assignedTo: string | null | undefined, advisors: Advisor[]) {
  if (!assignedTo) return null;
  const raw = assignedTo.trim();
  const needle = raw.toLowerCase();
  const exact = advisors.find((a: Advisor) => a.name === raw) || advisors.find((a: Advisor) => String(a.name || '').toLowerCase() === needle);
  if (exact) return exact;
  const inside = advisors
    .filter((a: Advisor) => a.name && needle.includes(String(a.name).toLowerCase()))
    .sort((a: Advisor, b: Advisor) => String(b.name).length - String(a.name).length)[0];
  if (inside) return inside;
  const first = words(raw)[0];
  const byFirst = advisors.filter((a: Advisor) => firstName(a.name) === first);
  return byFirst.length === 1 ? byFirst[0] : null;
}

// The advisor a label names by role: "the finance director", "PR".
export function matchAdvisorByRole(assignedTo: string | null | undefined, advisors: Advisor[]) {
  if (!assignedTo) return null;
  const needle = assignedTo.toLowerCase();
  const needleWords = words(needle);
  // The first word that says something: "the finance director" is about
  // finance, not about "the" (which every "The Chair" would match).
  const keyword = needleWords.find((w) => !FILLER.has(w));
  return advisors.find((a: Advisor) => {
    const role = (a.role || '').toLowerCase();
    if (!role) return false;
    const roleWords = words(role);
    // Short roles and labels ("CTO", "PR") match whole words only, so
    // "director" never means the CTO and "product" never means PR.
    if (role.length <= 3 ? needleWords.includes(role) : needle.includes(role)) return true;
    if (!keyword) return false;
    return keyword.length <= 3 ? roleWords.includes(keyword) : role.includes(keyword);
  }) || null;
}

// The advisor a label actually names, or null when it names nobody on this
// board, so a caller can decide what that means.
export function matchAdvisor(assignedTo: string | null | undefined, advisors: Advisor[]) {
  return matchAdvisorByName(assignedTo, advisors) || matchAdvisorByRole(assignedTo, advisors);
}

export function resolveAdvisor(assignedTo: string | null | undefined, advisors: Advisor[], participantNames?: string[] | null) {
  const matched = matchAdvisor(assignedTo, advisors);
  if (matched) return matched;

  // Prefer whoever was actually in the meeting that produced this commitment.
  const participant = advisors.find((a: Advisor) => (participantNames || []).includes(a.name));
  if (participant) return participant;

  return findChair(advisors) || advisors[0] || null;
}
