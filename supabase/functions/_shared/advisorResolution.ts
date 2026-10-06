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

export function resolveAdvisor(assignedTo: string | null | undefined, advisors: Advisor[], participantNames?: string[] | null) {
  if (assignedTo) {
    const exact = advisors.find((a: Advisor) => a.name === assignedTo);
    if (exact) return exact;

    const needle = assignedTo.toLowerCase();
    const byRole = advisors.find((a: Advisor) => {
      const role = (a.role || '').toLowerCase();
      return role && (needle.includes(role) || role.includes(needle.split(' ')[0]));
    });
    if (byRole) return byRole;
  }

  // Prefer whoever was actually in the meeting that produced this commitment.
  const participant = advisors.find((a: Advisor) => (participantNames || []).includes(a.name));
  if (participant) return participant;

  return findChair(advisors) || advisors[0] || null;
}
