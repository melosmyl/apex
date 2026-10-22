// Provider alerts (owner, 15 October 2026): which provider is failing, why,
// and what to do, from the last 30 minutes of usage logs. A fallback hides a
// failing provider from founders (that's its job), so this is how the owner
// finds out. Pure, so it can be tested; the providerHealth function stores
// and emails what it returns.
// deno-lint-ignore-file no-explicit-any

export const WINDOW_MS = 30 * 60_000;
// A provider is flagged after this many failed calls in the window, or any
// call that failed with no backup at all.
export const MIN_FAILURES = 3;

const NAMES: Record<string, string> = { anthropic: 'Claude (Anthropic)', openai: 'GPT-4o (OpenAI)' };
const OTHER: Record<string, string> = { anthropic: 'GPT-4o', openai: 'Claude' };
const CONSOLE: Record<string, string> = { anthropic: 'the Anthropic console (Plans & Billing)', openai: 'the OpenAI dashboard (Billing)' };

export function reasonOf(error: string) {
  const e = String(error || '');
  if (/credit balance|insufficient_quota|billing|exceeded your current quota/i.test(e)) return 'credit';
  // Status codes as whole numbers, so a latency like "134012ms" isn't a 401.
  if (/invalid x-api-key|incorrect api key|\b401\b|\b403\b|authentication|unauthori[sz]ed/i.test(e)) return 'key';
  if (/overload|\b529\b|rate.?limit|\b429\b|busy|capacity/i.test(e)) return 'busy';
  if (/timed out|timeout|out of time|no data for|silence|stalled/i.test(e)) return 'slow';
  return 'other';
}

// Attempts that say the provider itself failed. Not a refusal, a cut-off or
// malformed answer, or a caller that ran out of time: those are about the
// answer, not the provider.
const PROVIDER_FAILED = new Set(['api_error', 'schema_rejected', 'error', 'timeout', 'stalled', 'silence']);
const PROVIDER_REASONS = new Set(['credit', 'key', 'busy']);

// The provider whose attempt failed first in a logged call, and its error;
// null when the row isn't a provider failure.
function failureOf(row: any) {
  const attempts = Array.isArray(row?.attempts) ? row.attempts : [];
  const failed = attempts.find((a: any) => a && a.outcome && a.outcome !== 'ok');
  if (failed) {
    const error = String(failed.error || failed.message || row.error_code || '');
    if (!PROVIDER_FAILED.has(failed.outcome) && !PROVIDER_REASONS.has(reasonOf(error))) return null;
    return { provider: String(failed.provider || row.provider), error };
  }
  // Calls logged without attempts (e.g. a research task): only when the
  // error itself says the provider failed.
  const error = String(row?.error_code || '');
  return PROVIDER_REASONS.has(reasonOf(error)) ? { provider: String(row.provider), error } : null;
}

export function findFailures(rows: any[]) {
  const by = new Map<string, any>();
  for (const row of rows || []) {
    if (!['fallback_used', 'error'].includes(row?.status)) continue;
    const failure = failureOf(row);
    if (!failure?.provider) continue;
    const { provider, error } = failure;
    const g = by.get(provider) || { provider, calls: 0, unrescued: 0, latestError: '', latestAt: '' };
    g.calls += 1;
    if (row.status === 'error') g.unrescued += 1;
    if (!g.latestAt || String(row.created_at) > g.latestAt) { g.latestAt = String(row.created_at); g.latestError = error; }
    by.set(provider, g);
  }
  return [...by.values()].filter((g) => g.calls >= MIN_FAILURES || g.unrescued >= 1);
}

// What the owner reads, on the Admin page and in the email.
export function describe(g: any) {
  const name = NAMES[g.provider] || g.provider;
  const reason = reasonOf(g.latestError);
  const what = {
    credit: `The account is out of credit: top it up in ${CONSOLE[g.provider] || "the provider's console"}.`,
    key: 'The API key was refused: check the key in the Supabase secrets.',
    busy: 'The provider is overloaded or limiting us; this usually passes on its own.',
    slow: 'Calls are timing out.',
    other: '',
  }[reason];
  const effect = g.provider === 'anthropic'
    ? `Until it's fixed, advisors on Claude are answered by ${OTHER.anthropic}, the Chair can't write resolutions, and Research and Calculate tasks fail.`
    : `Until it's fixed, advisors on GPT-4o are answered by ${OTHER.openai}.`;
  const count = `${name} has failed ${g.calls} time${g.calls === 1 ? '' : 's'} in the last 30 minutes${g.unrescued ? ` (${g.unrescued} with no backup)` : ''}.`;
  return {
    reason,
    message: [count, what, effect].filter(Boolean).join(' '),
    subject: reason === 'credit' ? `Action needed: ${name} is out of credit` : `Action needed: ${name} is failing`,
    latest: String(g.latestError || '').slice(0, 300),
  };
}

// Whether to email about an alert now: a new incident (never emailed, or the
// last one ended more than 6 hours ago), or a reminder after 12 hours.
export const NEW_INCIDENT_GAP_MS = 6 * 60 * 60_000;
export const REMIND_EVERY_MS = 12 * 60 * 60_000;
export function shouldEmail(existing: any, now = Date.now()) {
  if (!existing) return true;
  const lastSeen = existing.last_seen ? new Date(existing.last_seen).getTime() : 0;
  if (now - lastSeen > NEW_INCIDENT_GAP_MS) return true;
  const emailed = existing.emailed_at ? new Date(existing.emailed_at).getTime() : 0;
  return now - emailed > REMIND_EVERY_MS;
}

// The email's body, for a real alert and for the test below.
export function alertText(d: { message: string; latest: string }) {
  return `${d.message}\n\nLatest error: ${d.latest}\n\nThis shows in red on the Admin page until it stops. You'll get a reminder every 12 hours while it lasts.`;
}

// A test the owner asks for (owner, 22 October 2026: confirm the alert
// email arrives). Says plainly that nothing is wrong, then shows a real
// alert's wording, made by the same code from a made-up example.
export function testEmail() {
  const example = describe({ provider: 'anthropic', calls: 4, unrescued: 0, latestError: 'Anthropic error: HTTP 400 — Your credit balance is too low to access the Anthropic API.' });
  return {
    subject: 'Test: Just Ask The Room alerts are working',
    text: `This is a test of the provider alert email. Nothing is wrong: it was sent because you asked for one.\n\n`
      + `If a provider starts failing, you'll get an email like the one below, once per incident, with a reminder every 12 hours while it lasts. This example is made up.\n\n`
      + `---\nSubject: ${example.subject}\n\n${alertText(example)}\n---`,
  };
}
