-- routeAdvisorRequest still writes one ai_usage_logs row per call (cost
-- reporting and the provider-health cron both read it that way), but that
-- row only ever kept the last error of a call that failed outright. A
-- primary model failing and being rescued by the fallback left no trace —
-- which hid every Claude advisor call failing in the 2026-09-30 meetings.
-- This records every model attempt behind the row, in order.
alter table public.ai_usage_logs
  add column if not exists attempts jsonb;

comment on column public.ai_usage_logs.attempts is
  'Every model attempt for this call, in order: [{n, provider, model, fallback, outcome, truncated, stop_reason, content_blocks, input_tokens, output_tokens, max_tokens, latency_ms, http_status, error, missing_fields}]. outcome: ok | no_text_block | invalid_json | missing_fields | timeout | api_error | error | skipped_deadline. stop_reason is Anthropic stop_reason or OpenAI finish_reason; truncated means max_tokens / length.';

-- From this change, input_size / output_size / estimated_cost total every
-- attempt in the call, not just the one that succeeded — a failed attempt
-- that returned a response was still billed, and the free-meeting spend
-- ceiling sums estimated_cost.
comment on column public.ai_usage_logs.estimated_cost is
  'Estimated USD for the whole call: every attempt in `attempts`, including failed ones that were billed.';

-- Let PostgREST see the new column straight away, so the function (deployed
-- after this) never has its inserts rejected by a stale schema cache.
notify pgrst, 'reload schema';
