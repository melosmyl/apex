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

notify pgrst, 'reload schema';
