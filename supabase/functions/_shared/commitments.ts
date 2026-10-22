// A commitment is a task the founder explicitly took on after a board
// meeting. Promoted out of startBoardMeeting into a shared module because
// prepareAccountabilityChases (Phase E) needs the identical query — the
// Assistant now owns the proactive chase that used to live in
// startBoardMeeting's chair-opening logic.
export const OVERDUE_AFTER_DAYS = 14;

// ownerId: the company owner. Only their own tasks count — a row that merely
// carries this company_id isn't trusted to belong to it (see _shared/access.ts).
// `limit`: how many rows to read. A meeting reads more than it lists, so
// repeats of one commitment don't crowd out the others (see oneEach).
// deno-lint-ignore no-explicit-any
export async function loadOpenCommitments(db: any, companyId: string, ownerId: string, limit = 20) {
  const { data, error } = await db.from('tasks')
    .select('id, title, status, created_at, advisor_id, assigned_to, board_meetings!inner(question, created_by_id)')
    .eq('company_id', companyId)
    .eq('created_by_id', ownerId)
    .eq('board_meetings.created_by_id', ownerId)
    .not('source_meeting_id', 'is', null)
    .neq('status', 'done')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('Could not load open commitments:', error.message);
    return [];
  }
  const now = Date.now();
  // deno-lint-ignore no-explicit-any
  return (data || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    days_open: Math.max(0, Math.floor((now - new Date(t.created_at).getTime()) / 86400000)),
    agreed_at: t.created_at,
    meeting_question: t.board_meetings?.question || 'a previous meeting',
    advisor_id: t.advisor_id || null,
    assigned_to: t.assigned_to || null,
  }));
}

// Each commitment once (owner, 22 October 2026). The same task agreed at
// several meetings (e.g. "Secure supplier quotes and lead times" three
// times) is one thing to do: kept once, the longest-open copy, with how many
// meetings agreed it. Same wording only, ignoring case, spacing and end
// punctuation; anything worded differently stays, so nothing is merged by
// guesswork.
const sameWords = (title: unknown) => String(title ?? '').toLowerCase().replace(/[^\p{L}\p{N}£$%]+/gu, ' ').trim();
// The key two copies of one commitment share. A title with no words is
// never merged with another.
export const commitmentKey = (c: { id?: string; title?: string } | null | undefined, fallback: unknown = '') =>
  sameWords(c?.title) || `untitled:${c?.id ?? fallback}`;
export function oneEach<T extends { id?: string; title?: string; days_open?: number }>(commitments: T[] = []): (T & { times_agreed: number })[] {
  const by = new Map<string, T & { times_agreed: number }>();
  for (const c of commitments || []) {
    const key = commitmentKey(c, by.size);
    const kept = by.get(key);
    if (!kept) { by.set(key, { ...c, times_agreed: 1 }); continue; }
    kept.times_agreed += 1;
    if ((c.days_open ?? 0) > (kept.days_open ?? 0)) by.set(key, { ...c, times_agreed: kept.times_agreed });
  }
  return [...by.values()];
}
