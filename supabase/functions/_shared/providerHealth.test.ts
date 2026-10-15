import { assert, assertEquals } from 'jsr:@std/assert@1';
import { describe, findFailures, reasonOf, shouldEmail } from './providerHealth.ts';

const credit = 'Anthropic error: HTTP 400 — Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
const fellBack = (at: string) => ({
  provider: 'openai', model: 'gpt-4o', status: 'fallback_used', created_at: at,
  attempts: [{ provider: 'anthropic', model: 'claude-sonnet-5', outcome: 'api_error', error: credit }, { provider: 'openai', model: 'gpt-4o', outcome: 'ok' }],
});

Deno.test('the failing provider is named, not the one that rescued the calls', () => {
  const rows = [fellBack('2026-10-15T10:01:00Z'), fellBack('2026-10-15T10:02:00Z'), fellBack('2026-10-15T10:03:00Z'),
    { provider: 'openai', status: 'success', created_at: '2026-10-15T10:04:00Z', attempts: [] }];
  const [g, ...rest] = findFailures(rows);
  assertEquals([g.provider, g.calls, g.unrescued, rest.length], ['anthropic', 3, 0, 0]);
  const d = describe(g);
  assertEquals([d.reason, d.subject], ['credit', 'Action needed: Claude (Anthropic) is out of credit']);
  assert(d.message.includes('top it up in the Anthropic console (Plans & Billing)'));
  assert(d.message.includes("the Chair can't write resolutions"));
});

Deno.test('two fallbacks are not yet an alert; one call with no backup is', () => {
  assertEquals(findFailures([fellBack('2026-10-15T10:01:00Z'), fellBack('2026-10-15T10:02:00Z')]).length, 0);
  const lost = { provider: 'anthropic', model: 'claude-opus-5-5', status: 'error', created_at: '2026-10-15T10:05:00Z', error_code: credit, attempts: [{ provider: 'anthropic', outcome: 'api_error', error: credit }] };
  const [g] = findFailures([lost]);
  assertEquals([g.provider, g.unrescued], ['anthropic', 1]);
  assert(describe(g).message.includes('(1 with no backup)'));
});

Deno.test('the reason is read from the error', () => {
  assertEquals(reasonOf(credit), 'credit');
  assertEquals(reasonOf('HTTP 401 — invalid x-api-key'), 'key');
  assertEquals(reasonOf('Anthropic error: during the reply — Overloaded'), 'busy');
  assertEquals(reasonOf('timed out after 60006ms'), 'slow');
  assertEquals(reasonOf('Invalid response format'), 'other');
});

Deno.test('one email per incident, and a reminder every 12 hours while it lasts', () => {
  const now = Date.parse('2026-10-15T14:00:00Z');
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  assertEquals(shouldEmail(null, now), true);
  assertEquals(shouldEmail({ last_seen: ago(0.1), emailed_at: ago(1) }, now), false);
  assertEquals(shouldEmail({ last_seen: ago(0.1), emailed_at: ago(13) }, now), true);
  // Seen last in August: today's failure is a new incident.
  assertEquals(shouldEmail({ last_seen: ago(24 * 60), emailed_at: null }, now), true);
});

Deno.test("only provider failures count: not a declined task, a cut-off answer or a caller out of time", () => {
  const research = { provider: 'anthropic', status: 'error', created_at: '2026-10-15T10:05:00Z', error_code: 'The advisor declined this task.' };
  const late = { provider: 'openai', status: 'error', created_at: '2026-10-15T10:05:00Z', attempts: [{ provider: 'openai', outcome: 'skipped_deadline', error: 'out of time before starting' }] };
  const cut = { provider: 'openai', status: 'fallback_used', created_at: '2026-10-15T10:05:00Z', attempts: [{ provider: 'anthropic', outcome: 'truncated', error: 'cut off at the limit' }, { provider: 'openai', outcome: 'ok' }] };
  assertEquals(findFailures([research, late, cut, cut, cut]).length, 0);
  // A research task that failed because the account is out of credit does count.
  assertEquals(findFailures([{ ...research, error_code: credit }])[0]?.provider, 'anthropic');
});

Deno.test('timeouts are read as slow, and a latency is never read as a status code', () => {
  assertEquals(reasonOf('Anthropic: out of time'), 'slow');
  assertEquals(reasonOf('no data for 60s'), 'slow');
  assertEquals(reasonOf('anthropic/claude-sonnet-5 (fallback): timed out after 134012ms'), 'slow');
  assertEquals(reasonOf('HTTP 429 — rate limited'), 'busy');
});
