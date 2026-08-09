-- Provider-level health alerting, born from a real incident on 2026-08-09:
-- Anthropic ran out of credits for hours and nobody noticed, because every
-- advisor call has a configured fallback — the product kept working, just
-- silently on the wrong model. Fallbacks are good for uptime and bad for
-- visibility. This closes that gap without any new external service: a
-- cron job scans ai_usage_logs on a schedule and surfaces two conditions —
-- hard provider errors, and an elevated fallback rate — as a persistent,
-- app-wide banner until acknowledged (and it reopens if the condition is
-- still true on the next scan, not just dismissed once and forgotten).
create extension if not exists pg_cron;

create table if not exists public.provider_health_alerts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  alert_type text not null check (alert_type in ('error', 'elevated_fallback')),
  message text not null,
  occurrence_count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  acknowledged boolean not null default false,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  unique (provider, alert_type)
);

alter table public.provider_health_alerts enable row level security;

create policy "authenticated users can read provider health alerts"
  on public.provider_health_alerts for select
  to authenticated using (true);

create policy "authenticated users can acknowledge provider health alerts"
  on public.provider_health_alerts for update
  to authenticated using (true) with check (true);

create or replace function public.check_provider_health() returns void
language plpgsql security definer as $$
declare
  r record;
begin
  -- Hard errors in the last 30 minutes, per provider.
  for r in
    select provider, count(*) as cnt, max(error_code) as sample_error
    from public.ai_usage_logs
    where status = 'error' and created_at > now() - interval '30 minutes'
    group by provider
  loop
    insert into public.provider_health_alerts (provider, alert_type, message, occurrence_count)
    values (r.provider, 'error', format('%s API error(s) from %s in the last 30 minutes. Latest: %s', r.cnt, r.provider, r.sample_error), r.cnt)
    on conflict (provider, alert_type) do update
      set occurrence_count = excluded.occurrence_count,
          message = excluded.message,
          last_seen = now(),
          acknowledged = false,
          acknowledged_at = null,
          acknowledged_by = null;
  end loop;

  -- Elevated fallback rate in the last 60 minutes. ai_usage_logs.provider on
  -- a fallback_used row is the provider actually used (the rescue), not the
  -- one abandoned — group by that, since that's the provider now carrying
  -- load its advisors weren't configured to send it. 3+ in an hour is worth
  -- a look, even though every one of them individually "succeeded".
  for r in
    select provider, count(*) as cnt
    from public.ai_usage_logs
    where status = 'fallback_used' and created_at > now() - interval '60 minutes'
    group by provider
    having count(*) >= 3
  loop
    insert into public.provider_health_alerts (provider, alert_type, message, occurrence_count)
    values (r.provider, 'elevated_fallback', format('%s call(s) landed on %s as a fallback in the last hour — their intended provider is failing.', r.cnt, r.provider), r.cnt)
    on conflict (provider, alert_type) do update
      set occurrence_count = excluded.occurrence_count,
          message = excluded.message,
          last_seen = now(),
          acknowledged = false,
          acknowledged_at = null,
          acknowledged_by = null;
  end loop;
end;
$$;

select cron.schedule('check-provider-health', '*/15 * * * *', $$select public.check_provider_health();$$);
