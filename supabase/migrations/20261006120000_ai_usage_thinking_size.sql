-- Phase 1b Stage 1: thinking tokens logged apart from the visible answer.
--
-- Anthropic now reports how many of a reply's output tokens were thinking
-- (usage.output_tokens_details.thinking_tokens). output_size stays the
-- billed total, thinking included; thinking_size is the part of it spent
-- thinking, summed over every attempt of the call. Null when the provider
-- didn't say (OpenAI's gpt-4o doesn't think). Per-attempt figures, with the
-- thinking setting and effort sent, are in the attempts column.

set lock_timeout = '5s';

alter table public.ai_usage_logs add column if not exists thinking_size numeric;
comment on column public.ai_usage_logs.thinking_size is
  'Output tokens spent thinking, across every attempt of the call (included in output_size). Null when the provider did not report it.';

notify pgrst, 'reload schema';
