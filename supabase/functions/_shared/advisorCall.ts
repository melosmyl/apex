// Calling one advisor (routeAdvisorRequest) from a meeting step, so an
// advisor doesn't go silent on a meeting because of a hiccup between our own
// functions (owner, 16 October 2026: two turns lost, no trace of either).
//
// - A call that never reached the model (a gateway or worker error, an
//   answer that isn't JSON, a dropped connection) is tried once more after a
//   short pause, while there's time in the step. One that reached the model
//   and failed there has already had its own retries and backup model, so it
//   isn't paid for again.
// - A call that never reached the model is logged here (routeAdvisorRequest
//   couldn't), as an internal failure: the record shows it, and the provider
//   alert doesn't blame Claude or OpenAI for it.
// - The error carries why, for the caller to keep.
// deno-lint-ignore-file no-explicit-any
import { insertUsageLog } from './llmCall.ts';

export const RETRY_NEEDS_MS = 45_000;
const RETRY_PAUSE_MS = 1_500;

export class AdvisorCallError extends Error {
  status: number;
  reason: string;
  constructor(message: string, status: number, reason: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

type Attempt = { ok: true; data: any } | { ok: false; status: number; reason: string; logged: boolean };

async function once(url: string, serviceKey: string, payload: any, fetchImpl: typeof fetch, timeoutMs: number | null): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetchImpl(`${url}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(payload),
      // A hung gateway can't outlast the step.
      ...(timeoutMs != null ? { signal: AbortSignal.timeout(Math.max(5_000, timeoutMs)) } : {}),
    });
  } catch (e) {
    return { ok: false, status: 0, reason: `the call didn't connect: ${(e as Error).message}`, logged: false };
  }
  const text = await res.text().catch(() => '');
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON: a gateway or worker error page */ }
  if (res.ok && data && !data.error) return { ok: true, data };
  // routeAdvisorRequest logs every call that reaches the model and says why
  // in `reason`; anything else never got that far.
  const logged = !!data?.reason;
  const reason = data?.reason || data?.error || `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ' with no answer'}`;
  return { ok: false, status: res.status, reason: String(reason).slice(0, 500), logged };
}

// A refusal (bad request, not allowed, not found) won't do better next time.
const refusal = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 429;

export async function callAdvisorWithRetry(
  supabaseUrl: string, serviceKey: string, payload: any,
  { db = null, deadlineAt = null, fetchImpl = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), provider = null, model = null }:
  { db?: any; deadlineAt?: number | null; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<unknown>; now?: () => number; provider?: string | null; model?: string | null } = {},
) {
  const until = deadlineAt ?? (Number.isFinite(payload?.deadline_at) ? payload.deadline_at : null);
  let last: Attempt | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_PAUSE_MS);
    const r = await once(supabaseUrl, serviceKey, payload, fetchImpl, until != null ? until - now() + 10_000 : null);
    if (r.ok) return { ...r.data, ...(attempt > 0 ? { retried: true } : {}) };
    last = r;
    // Reached the model and failed there (already retried and backed up),
    // or refused: no second try.
    if (r.logged || refusal(r.status)) break;
    if (db) {
      await insertUsageLog(db, {
        user_id: payload.user_id || null, company_id: payload.company_id || null, meeting_id: payload.meeting_id || null,
        advisor_id: payload.advisor_id || null, provider: 'internal', model: model || 'unknown',
        request_type: payload.request_type || 'unknown', input_size: 0, output_size: 0, thinking_size: 0, estimated_cost: 0,
        latency_ms: 0, status: 'error', error_code: `call failed before reaching the model (${provider || 'unknown'} advisor): ${r.reason}`,
        attempts: [{ provider: 'internal', model: model || 'unknown', outcome: 'caller_error', error: 'the call never reached the model' }],
        anonymous: payload.anonymous === true,
      }).catch(() => {});
    }
    if (until != null && until - now() < RETRY_NEEDS_MS) break;
  }
  const f = last as Extract<Attempt, { ok: false }>;
  throw new AdvisorCallError('This advisor was temporarily unavailable.', f.status, f.reason);
}
