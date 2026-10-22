// A founder's own data (owner, 22 October 2026, D3): a copy of all of it,
// and deleting it, a company or the whole account. Shared by the myData
// function and its tests.
// deno-lint-ignore-file no-explicit-any

export const FILES_BUCKET = 'documents';

// Every table that holds the founder's own rows, and the column that says
// they're theirs. Only the founder's own rows; where a row also carries our
// internal figures (what a call cost us, how it was retried), only the
// columns that are about them (`columns`).
export const OWN_TABLES: { table: string; owner: string; columns?: string }[] = [
  { table: 'profiles', owner: 'id' },
  { table: 'companies', owner: 'created_by_id' },
  { table: 'advisors', owner: 'created_by_id' },
  { table: 'projects', owner: 'created_by_id' },
  { table: 'board_meetings', owner: 'created_by_id' },
  { table: 'meeting_messages', owner: 'created_by_id' },
  { table: 'voice_meeting_sessions', owner: 'created_by_id' },
  { table: 'decisions', owner: 'created_by_id' },
  { table: 'tasks', owner: 'created_by_id' },
  { table: 'task_runs', owner: 'created_by_id' },
  { table: 'documents', owner: 'created_by_id' },
  { table: 'document_download_logs', owner: 'created_by_id' },
  { table: 'pins', owner: 'created_by_id' },
  { table: 'notes', owner: 'created_by_id' },
  { table: 'assistant_chases', owner: 'created_by_id' },
  { table: 'assistant_events', owner: 'user_id' },
  { table: 'progression_trees', owner: 'created_by_id' },
  { table: 'progression_nodes', owner: 'created_by_id' },
  { table: 'progression_node_completions', owner: 'created_by_id' },
  { table: 'subscriptions', owner: 'created_by_id' },
  { table: 'deliverable_generation_logs', owner: 'user_id', columns: 'id, company_id, task_id, advisor_id, document_id, document_type, export_format, status, created_at' },
  { table: 'free_meeting_attempts', owner: 'user_id', columns: 'id, started_at, completed, company_id, meeting_id, created_at' },
  { table: 'ai_usage_logs', owner: 'user_id', columns: 'id, created_at, company_id, meeting_id, advisor_id, task_run_id, request_type, provider, model, status, input_size, output_size' },
];

// Search indexes are numbers, not content: left out of the copy.
const LEFT_OUT = new Set(['embedding']);
export const forCopy = (row: any) => Object.fromEntries(Object.entries(row || {}).filter(([k]) => !LEFT_OUT.has(k)));

// How long the database's daily backups keep a copy after deletion. Daily
// backups are kept 7 days on Supabase's Pro plan (14 on Team, up to 30 on
// Enterprise): https://supabase.com/docs/guides/platform/backups
export const BACKUP_DAYS = 7;

// What the founder types to delete their account.
export const DELETE_PHRASE = 'delete my account';
export const confirmed = (typed: unknown) => String(typed ?? '').trim().toLowerCase() === DELETE_PHRASE;

// All of a table's rows for the owner, page by page (the API returns at most
// 1000 at a time).
export async function allRows(db: any, table: string, owner: string, userId: string, columns = '*') {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).eq(owner, userId).order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`reading ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

// Every stored file under a company's folder, as full paths.
export async function companyFiles(db: any, companyId: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(FILES_BUCKET).list(companyId, { limit: 1000, offset });
    if (error) throw new Error(`listing files: ${error.message}`);
    paths.push(...(data || []).filter((f: any) => f?.name && f.id !== null).map((f: any) => `${companyId}/${f.name}`));
    if (!data || data.length < 1000) return paths;
  }
}

// Removes a company's stored files; its rows go with the company (the
// database deletes everything that hangs off it).
export async function removeCompanyFiles(db: any, companyId: string) {
  const paths = await companyFiles(db, companyId);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(FILES_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`removing files: ${error.message}`);
  }
  return paths.length;
}
