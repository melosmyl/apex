-- Security checkpoint, Part B: per-user limits on paid calls.
--
-- checkRateLimit (public_access_log) keys on the client IP, which is right
-- for unauthenticated share links but wrong for signed-in calls: one person
-- can rotate IPs, and an office shares one. Signed-in limits key on the user
-- id instead. Only edge functions (service role) read or write this table.
create table if not exists public.user_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists user_rate_events_lookup_idx
  on public.user_rate_events (user_id, action, created_at desc);

alter table public.user_rate_events enable row level security;
revoke all on public.user_rate_events from anon, authenticated;

comment on table public.user_rate_events is
  'One row per rate-limited action by a signed-in user (see _shared/access.ts checkUserLimit). Service role only; rows older than 2 days are purged daily.';

-- The longest window in use is one day.
select cron.schedule(
  'purge-user-rate-events',
  '20 3 * * *',
  $$ delete from public.user_rate_events where created_at < now() - interval '2 days'; $$
);

-- ---------------------------------------------------------------------
-- The model registry: ai_model_configurations decides which models may run.
--
-- routeAdvisorRequest (via _shared/modelRegistry.ts) only runs models with
-- an active row here; an advisor row asking for anything else gets its
-- provider's default instead. Founders can edit their advisor rows, so the
-- row's model is a request, not an instruction. Approving a new model
-- (Sonnet 5.5, Fable 5.1, Workstream H's providers) is an insert here.
-- H3 adds prices, output limits and thinking modes to this same table.
-- ---------------------------------------------------------------------
alter table public.ai_model_configurations
  add column if not exists is_provider_default boolean not null default false;
create unique index if not exists ai_model_configurations_one_default_per_provider
  on public.ai_model_configurations (provider) where is_provider_default and is_active;

comment on column public.ai_model_configurations.is_provider_default is
  'The model an unapproved advisor request is replaced with, one per provider.';

-- The two models every library advisor uses today (gpt-4o-mini is already
-- registered as the cheap tier).
insert into public.ai_model_configurations
  (provider, model_name, display_name, purpose, is_active, is_provider_default, relative_cost_level, speed_level, quality_level, notes)
select 'openai', 'gpt-4o', 'GPT-4o', 'advisor', true, true, 'medium', 'fast', 'high',
  'Default OpenAI model for advisors.'
where not exists (select 1 from public.ai_model_configurations where provider = 'openai' and model_name = 'gpt-4o');

insert into public.ai_model_configurations
  (provider, model_name, display_name, purpose, is_active, is_provider_default, relative_cost_level, speed_level, quality_level, notes)
select 'anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 'advisor', true, true, 'medium', 'medium', 'premium',
  'Default Anthropic model for advisors and the Chair.'
where not exists (select 1 from public.ai_model_configurations where provider = 'anthropic' and model_name = 'claude-sonnet-5');

-- Each library advisor's own default model (and backup), the first choice
-- when an advisor row asks for a model the registry hasn't approved. Seeded
-- from src/lib/advisorLibrary.js; H4 makes these editable in Admin.
create table if not exists public.advisor_model_defaults (
  library_key text primary key,
  provider text not null,
  model_name text not null,
  fallback_provider text,
  fallback_model text,
  updated_at timestamptz not null default now()
);
alter table public.advisor_model_defaults enable row level security;
revoke all on public.advisor_model_defaults from anon, authenticated;

insert into public.advisor_model_defaults (library_key, provider, model_name, fallback_provider, fallback_model) values
  ('visionary', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('operator', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('creative_director', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('investor', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('customer_advocate', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('contrarian', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('chair', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('cfo', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('marketing_director', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('product_strategist', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('legal_advisor', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('scientist', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('supply_chain', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('people_culture', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('innovation_director', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('risk_analyst', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('capital_allocator', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('ai_expert', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('elon_musk', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('warren_buffett', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o'),
  ('jeff_bezos', 'openai', 'gpt-4o', 'anthropic', 'claude-sonnet-5'),
  ('rick_rubin', 'anthropic', 'claude-sonnet-5', 'openai', 'gpt-4o')
on conflict (library_key) do nothing;

-- When a call runs a different model from the one the advisor row asked
-- for, what was asked for and why it was swapped. Null when nothing was.
alter table public.ai_usage_logs add column if not exists model_substitution text;
comment on column public.ai_usage_logs.model_substitution is
  'Set when the advisor row asked for a model the registry has not approved: requested model, model used, and which default replaced it.';

notify pgrst, 'reload schema';
