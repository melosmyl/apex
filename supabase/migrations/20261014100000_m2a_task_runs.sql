-- Workstream M2a: "Do this for me". The advisor who owns a task does it in
-- the background (draft and plan first), and the founder decides what to do
-- with the result: accept it (it goes to Knowledge and the task is done),
-- redo it with notes, or discard it.
--
-- Every attempt is its own row, so a redo keeps the earlier one. Only the
-- server writes runs; the founder reads their own.

create table if not exists public.task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by_id uuid not null references auth.users(id) on delete cascade,
  advisor_id uuid references public.advisors(id) on delete set null,
  advisor_name text,
  task_type text not null check (task_type in ('research', 'draft', 'calculate', 'plan')),
  -- queued -> running -> done | failed; then accepted | discarded by the founder.
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'accepted', 'discarded')),
  redo_notes text check (char_length(redo_notes) <= 1000),
  previous_run_id uuid references public.task_runs(id) on delete set null,
  -- How many times a worker has picked it up; a stalled run is restarted
  -- at most twice.
  attempts integer not null default 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  cost_usd numeric not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One run in progress per task at a time.
create unique index if not exists task_runs_one_active
  on public.task_runs (task_id) where status in ('queued', 'running');
create index if not exists task_runs_task_idx on public.task_runs (task_id, created_at desc);
create index if not exists task_runs_sweep_idx on public.task_runs (status, claimed_at) where status in ('queued', 'running');

alter table public.task_runs enable row level security;
revoke all on public.task_runs from anon, authenticated;
grant select on public.task_runs to authenticated;
create policy "task_runs_owner_or_admin_select" on public.task_runs
  for select using (created_by_id = auth.uid() or public.is_admin());

-- What each run cost, from the model calls it made.
alter table public.ai_usage_logs
  add column if not exists task_run_id uuid references public.task_runs(id) on delete set null;
create index if not exists ai_usage_logs_task_run_idx on public.ai_usage_logs (task_run_id) where task_run_id is not null;

-- Claude Sonnet 5.5 runs Draft and Plan (owner's decision, Workstream M).
-- Approved for advisors; not a provider default, so nothing else changes.
insert into public.ai_model_configurations
  (provider, model_name, display_name, purpose, is_active, is_provider_default, relative_cost_level, speed_level, quality_level, notes)
select 'anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 'advisor', true, false, 'medium', 'fast', 'high',
  'Runs "Do this for me" Draft and Plan tasks (Workstream M2a).'
where not exists (
  select 1 from public.ai_model_configurations where provider = 'anthropic' and model_name = 'claude-sonnet-5-5'
);

-- Every minute: start runs nobody picked up and restart stalled ones. Same
-- pattern as the accountability chases: pg_cron -> pg_net -> the function,
-- with the service-role key from Vault. The function is only called when a
-- run is actually waiting (the thresholds match taskRun's sweep).
select cron.schedule(
  'task-runs-sweep',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://bqqcobaspbkyofupmhfe.supabase.co/functions/v1/taskRun',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"action":"sweep"}'::jsonb,
    -- pg_net gives up after 5 seconds by default; the sweep answers in about
    -- one (the work itself runs after the answer), so 10 is ample headroom.
    timeout_milliseconds := 10000
  )
  where exists (
    select 1 from public.task_runs
    where (status = 'queued' and created_at < now() - interval '30 seconds')
       or (status = 'running' and claimed_at < now() - interval '4 minutes')
  );
  $$
);
