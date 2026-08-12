// A commitment is a task the founder explicitly took on after a board
// meeting. Promoted out of startBoardMeeting into a shared module because
// prepareAccountabilityChases (Phase E) needs the identical query — the
// Assistant now owns the proactive chase that used to live in
// startBoardMeeting's chair-opening logic.
export const OVERDUE_AFTER_DAYS = 14;

export async function loadOpenCommitments(db, companyId) {
  const { data, error } = await db.from('tasks')
    .select('id, title, status, created_at, board_meetings!inner(question)')
    .eq('company_id', companyId)
    .not('source_meeting_id', 'is', null)
    .neq('status', 'done')
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) {
    console.error('Could not load open commitments:', error.message);
    return [];
  }
  const now = Date.now();
  return (data || []).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    days_open: Math.max(0, Math.floor((now - new Date(t.created_at).getTime()) / 86400000)),
    meeting_question: t.board_meetings?.question || 'a previous meeting',
  }));
}
