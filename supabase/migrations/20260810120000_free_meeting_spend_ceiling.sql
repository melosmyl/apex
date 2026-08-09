-- Phase 4.1 — daily spend ceiling for the free, unauthenticated board
-- meeting, plus enough per-attempt logging to tell real demand from abuse
-- after the fact. Ceiling stored in USD (matches ai_usage_logs.estimated_cost
-- already), £10/day at a fixed approximate rate (1 GBP ≈ 1.27 USD) — not
-- live FX, this is a safety guardrail, not a financial product. Adjust
-- manually if the rate moves a lot.
alter table public.system_limits
  add column if not exists free_meeting_daily_cost_ceiling_usd numeric not null default 12.70;

-- One row per free-meeting attempt, from the moment Turnstile+rate-limit
-- pass, through completion. ip_hash, never a raw IP — enough to see "one
-- visitor tried 40 times" without storing anything identifying. company_id
-- /meeting_id are nullable and go null if the underlying rows are later
-- cleaned up (30-day anonymous purge) — the attempt record itself outlives
-- them, since that's the whole point: knowing what happened after the data
-- it points to is gone.
create table if not exists public.free_meeting_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  started_at timestamptz not null default now(),
  completed boolean not null default false,
  actual_cost numeric,
  company_id uuid references public.companies(id) on delete set null,
  meeting_id uuid references public.board_meetings(id) on delete set null,
  blocked_reason text,
  created_at timestamptz not null default now()
);

create index if not exists free_meeting_attempts_started_idx on public.free_meeting_attempts (started_at);
create index if not exists free_meeting_attempts_ip_idx on public.free_meeting_attempts (ip_hash, started_at);

alter table public.free_meeting_attempts enable row level security;
-- Service-role only, same as public_access_log — no client ever reads or
-- writes this table directly.

-- Widen provider_health_alerts to also carry spend-ceiling alerts, reusing
-- the same cron + banner mechanism already built for provider errors rather
-- than standing up a second, parallel alerting path.
alter table public.provider_health_alerts drop constraint if exists provider_health_alerts_alert_type_check;
alter table public.provider_health_alerts add constraint provider_health_alerts_alert_type_check
  check (alert_type in ('error', 'elevated_fallback', 'free_meeting_spend_50', 'free_meeting_spend_80', 'free_meeting_spend_100'));

create or replace function public.check_free_meeting_spend() returns void
language plpgsql security definer as $$
declare
  ceiling numeric;
  spent numeric;
  pct numeric;
begin
  select free_meeting_daily_cost_ceiling_usd into ceiling from public.system_limits order by created_at desc limit 1;
  if ceiling is null then return; end if;

  select coalesce(sum(actual_cost), 0) into spent
  from public.free_meeting_attempts
  where started_at >= date_trunc('day', now());

  pct := spent / ceiling * 100;

  if pct >= 100 then
    insert into public.provider_health_alerts (provider, alert_type, message, occurrence_count)
    values ('free_meeting', 'free_meeting_spend_100', format('Free meeting spend has reached the daily ceiling: $%s of $%s (today, UTC). The door is now closed until it resets.', round(spent, 2), ceiling), 1)
    on conflict (provider, alert_type) do update set message = excluded.message, last_seen = now(), acknowledged = false, acknowledged_at = null, acknowledged_by = null;
  elsif pct >= 80 then
    insert into public.provider_health_alerts (provider, alert_type, message, occurrence_count)
    values ('free_meeting', 'free_meeting_spend_80', format('Free meeting spend is at %s%% of today''s daily ceiling: $%s of $%s.', round(pct), round(spent, 2), ceiling), 1)
    on conflict (provider, alert_type) do update set message = excluded.message, last_seen = now(), acknowledged = false, acknowledged_at = null, acknowledged_by = null;
  elsif pct >= 50 then
    insert into public.provider_health_alerts (provider, alert_type, message, occurrence_count)
    values ('free_meeting', 'free_meeting_spend_50', format('Free meeting spend is at %s%% of today''s daily ceiling: $%s of $%s.', round(pct), round(spent, 2), ceiling), 1)
    on conflict (provider, alert_type) do update set message = excluded.message, last_seen = now(), acknowledged = false, acknowledged_at = null, acknowledged_by = null;
  end if;
end;
$$;

select cron.schedule('check-free-meeting-spend', '*/15 * * * *', $$select public.check_free_meeting_spend();$$);
