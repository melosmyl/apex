// The founder's call on a resolution (owner, 16 October 2026): three
// states, never blurred. "Recommended" is what the board said; the founder's
// call is accept, modify or reject (with their reason); anything else is
// still open. A recommendation the founder hasn't acted on is never a
// decision: not in board memory, not in the Chair's opening.
// deno-lint-ignore-file no-explicit-any
import { dayOf } from './recordDates.ts';

export type CallState = 'accept' | 'modify' | 'reject' | 'decided' | 'open';

const MADE = ['accept', 'modify', 'reject'];
const cut = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

// The state of a meeting's resolution, or of a Decision Centre record with
// its meeting's call attached (`call`, `call_notes`). The meeting's call
// wins; a record the founder marked decided on the Decisions page counts as
// decided with their words; otherwise it's open.
// A meeting may carry its Decision Centre record's state as decision_status
// and decision_taken (a meeting's own status is its progress, not this).
export function callOf(item: any): { state: CallState; reason: string } {
  const call = item?.founder_decision ?? item?.call;
  const notes = item?.founder_decision_notes ?? item?.call_notes;
  if (MADE.includes(call)) return { state: call, reason: cut(notes, 500) };
  const recordStatus = item?.decision_status ?? (item?.founder_decision === undefined ? item?.status : undefined);
  if (['decided', 'reviewed'].includes(recordStatus) && cut(item?.decision_taken, 500)) return { state: 'decided', reason: cut(item.decision_taken, 500) };
  // An older call kept from before (e.g. "custom") with the founder's words.
  if (call && !['undecided', 'pending'].includes(call) && cut(notes, 500)) return { state: 'decided', reason: cut(notes, 500) };
  return { state: 'open', reason: '' };
}

// Decision Centre records with their meeting's call, and meetings with their
// Decision Centre record's state: each call is read from wherever the
// founder made it. The owner's own rows only.
export async function withCalls(db: any, ownerId: string, { decisions = [], meetings = [] }: { decisions?: any[]; meetings?: any[] }) {
  try {
    const meetingIds = [...new Set(decisions.map((d) => d.meeting_id).filter(Boolean))];
    const { data: calls } = meetingIds.length
      ? await db.from('board_meetings').select('id, founder_decision, founder_decision_notes').in('id', meetingIds).eq('created_by_id', ownerId)
      : { data: [] };
    const callById = new Map((calls || []).map((r: any) => [r.id, r]));
    const { data: records } = meetings.length
      ? await db.from('decisions').select('meeting_id, status, decision_taken').in('meeting_id', meetings.map((m) => m.id)).eq('created_by_id', ownerId)
      : { data: [] };
    const recordByMeeting = new Map<string, any>();
    for (const r of records || []) if (['decided', 'reviewed'].includes(r.status) && cut(r.decision_taken, 1)) recordByMeeting.set(r.meeting_id, r);
    return {
      decisions: decisions.map((d) => ({ ...d, call: (callById.get(d.meeting_id) as any)?.founder_decision ?? null, call_notes: (callById.get(d.meeting_id) as any)?.founder_decision_notes ?? null })),
      meetings: meetings.map((m) => (recordByMeeting.has(m.id) ? { ...m, decision_status: recordByMeeting.get(m.id).status, decision_taken: recordByMeeting.get(m.id).decision_taken } : m)),
    };
  } catch (e) {
    console.error("Reading the founder's calls failed:", (e as Error).message);
    return { decisions, meetings };
  }
}

export const isOpen = (item: any) => callOf(item).state === 'open';

// One line for the board: what was recommended, and the founder's call.
export function callLine(item: any) {
  const { state, reason } = callOf(item);
  switch (state) {
    case 'accept': return `The founder ACCEPTED it${reason ? `: "${reason}"` : ''}.`;
    case 'modify': return `The founder MODIFIED it${reason ? `: "${reason}"` : ''}.`;
    case 'reject': return `The founder REJECTED it${reason ? `: "${reason}"` : ''}.`;
    case 'decided': return `The founder decided: "${reason}".`;
    default: return `STILL OPEN: the founder hasn't decided on it. It is the board's earlier advice, not a decision.`;
  }
}

// The meeting history in the board's brief, with each call stated.
export function pastMeetingsSection(meetings: any[] = []) {
  if (!meetings?.length) return '';
  let text = `\nPrevious Board Meetings (what the board recommended, and the founder's call on it):\n`;
  meetings.slice(0, 3).forEach((m) => {
    const when = dayOf(m.created_at);
    text += `- ${when ? `[${when}] ` : ''}Q: ${cut(m.question, 300)} -> ${callLine(m)} Recommended: ${cut(m.board_resolution?.recommended_direction || m.recommendation || m.executive_summary || 'N/A', 400)}\n`;
  });
  return text;
}

// Board memory: past resolutions related to the question, each with the
// founder's call. Consistency is owed to the founder's calls, not to
// recommendations they never acted on.
export function pastResolutionsSection(decisions: any[] = []) {
  if (!decisions?.length) return '';
  let text = `\nPast resolutions related to this question (most relevant first), with the founder's call on each:\n`;
  decisions.slice(0, 5).forEach((d) => {
    const when = dayOf(d.created_at) || 'date unknown';
    text += `- [${when}] ${cut(d.question, 300)}: ${callLine(d)} Recommended: ${cut(d.final_recommendation || d.summary || 'N/A', 400)}\n`;
  });
  text += `MEMORY PRINCIPLE — this is mandatory, not optional:\n`;
  text += `- Only the founder's calls are decisions. Say explicitly whether your recommendation is consistent with any call the founder made, or departs from it; if it departs, name the call and explain what has changed to justify reversing it. A board that quietly contradicts the founder's decisions is worse than useless.\n`;
  text += `- A recommendation marked STILL OPEN was never decided. Never describe it as a decision or as settled; you may build on it, or revisit it freely.\n`;
  text += `- If none of these bear on this question, say that explicitly rather than staying silent.\n`;
  return text;
}

// The Chair's opening: calls the founder hasn't made yet, named as open.
export function openCallsForOpening(meetings: any[] = [], max = 3) {
  const open = (meetings || []).filter((m) => m?.board_resolution && isOpen(m)).slice(0, max);
  if (!open.length) return '';
  let text = `\nCalls the founder hasn't made yet (the board recommended these; the founder has neither accepted, modified nor rejected them):\n`;
  open.forEach((m) => { text += `- "${cut(m.question, 300)}": the board recommended "${cut(m.board_resolution?.recommended_direction || m.recommendation, 300)}"\n`; });
  text += `Name these plainly as open, in a line, e.g. "You haven't decided on X yet." Never describe them as resolutions that stand or as decided, and don't press: it is their call.\n`;
  return text;
}

// The Chair's fallback opening, when the model's can't be used: the open
// calls, said plainly.
export function openCallsSentence(meetings: any[] = [], max = 3) {
  const open = (meetings || []).filter((m) => m?.board_resolution && isOpen(m)).slice(0, max);
  if (!open.length) return '';
  return ` You haven't decided yet on ${open.map((m) => `"${cut(m.question, 120)}"`).join(open.length === 2 ? ' or ' : ', ')}.`;
}
