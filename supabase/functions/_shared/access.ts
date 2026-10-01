// Ownership and abuse checks shared by every function that acts on a
// company, meeting, task, note or decision named in the request.
//
// These functions read and write with the service-role client, which
// bypasses RLS, so the ownership rule RLS would have applied has to be
// re-applied here: the caller must own the company, and the row must belong
// to both the caller and that company. Rows can't be trusted to sit in the
// company their company_id names until the RLS insert checks are tightened
// (security checkpoint Part C), hence the second condition.

// deno-lint-ignore no-explicit-any
type Db = any;

export class AccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function accessErrorResponse(e: unknown, headers: Record<string, string>): Response | null {
  if (e instanceof AccessError) return Response.json({ error: e.message }, { status: e.status, headers });
  return null;
}

export async function requireOwnedCompany(db: Db, companyId: string | undefined, userId: string, columns = 'id, created_by_id') {
  if (!companyId) throw new AccessError(400, 'company_id is required');
  const cols = columns.includes('created_by_id') ? columns : `${columns}, created_by_id`;
  const { data: company } = await db.from('companies').select(cols).eq('id', companyId).maybeSingle();
  if (!company) throw new AccessError(404, 'Company not found');
  if (company.created_by_id !== userId) throw new AccessError(403, 'Forbidden');
  return company;
}

// A row from a company-scoped table (board_meetings, tasks, notes,
// decisions, documents, advisors) that the caller created, inside a company
// the caller owns.
export async function requireOwnedRow(db: Db, table: string, id: string | undefined, userId: string, columns = '*') {
  if (!id) throw new AccessError(400, `${table} id is required`);
  const { data: row } = await db.from(table).select(columns).eq('id', id).maybeSingle();
  if (!row) throw new AccessError(404, 'Not found');
  if (row.created_by_id !== userId) throw new AccessError(403, 'Forbidden');
  if (row.company_id) await requireOwnedCompany(db, row.company_id, userId);
  return row;
}

export function requireNotAnonymous(user: { is_anonymous?: boolean }) {
  if (user.is_anonymous) throw new AccessError(403, 'Sign up to use this feature.');
}

export function requireMaxLength(value: unknown, max: number, label: string) {
  if (typeof value === 'string' && value.length > max)
    throw new AccessError(400, `${label} is too long (${value.length} characters; the limit is ${max}).`);
}

// Abuse limits for signed-in users: high enough that real use never meets
// them, low enough to stop a runaway script spending on our model accounts.
// Pricing limits are a separate thing (C3).
export const USER_LIMITS = {
  board_meeting: { max: 20, windowMinutes: 24 * 60 },
  deliverable: { max: 30, windowMinutes: 24 * 60 },
  onboarding_plan: { max: 5, windowMinutes: 24 * 60 },
  note_relevance: { max: 120, windowMinutes: 60 },
  note_process: { max: 60, windowMinutes: 60 },
  progression_answer: { max: 10, windowMinutes: 60 },
} as const;

export const TEXT_LIMITS = {
  question: 4000,
  founder_message: 2000,
  note: 4000,
  progression_answer: 1000,
  onboarding_answer: 2000,
  onboarding_total: 8000,
};

export const MAX_FOLLOWUPS_PER_MEETING = 10;

// Records the attempt first, then counts, so concurrent requests can't all
// slip under the limit together, and a denied request still counts.
export async function checkUserLimit(db: Db, userId: string, action: keyof typeof USER_LIMITS) {
  const { max, windowMinutes } = USER_LIMITS[action];
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  await db.from('user_rate_events').insert({ user_id: userId, action });
  const { count, error } = await db.from('user_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('action', action).gte('created_at', since);
  // If the limiter itself is unavailable (e.g. migration not applied yet),
  // don't take the feature down with it.
  if (error) { console.error('checkUserLimit failed:', error.message); return; }
  if ((count ?? 0) > max) throw new AccessError(429, 'You have reached the limit for this right now. Please try again later.');
}
