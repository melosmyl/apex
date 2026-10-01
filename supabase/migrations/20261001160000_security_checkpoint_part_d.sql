-- Security checkpoint, Part D: the free meeting, enforced by the server.
--
-- Until now the daily ceiling added up free_meeting_attempts.actual_cost,
-- which only the browser filled in (voluntarily, after the meeting, for any
-- attempt id it named), and nothing tied an attempt to the visitor who got
-- it. Spend is now read from ai_usage_logs, which the server writes for
-- every model call, and each attempt belongs to one session.

alter table public.free_meeting_attempts
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;
create index if not exists free_meeting_attempts_user_idx on public.free_meeting_attempts (user_id);

comment on column public.free_meeting_attempts.user_id is
  'The anonymous session the attempt was issued to. startBoardMeeting only accepts an attempt from its own session.';
comment on column public.free_meeting_attempts.claimed_at is
  'When startBoardMeeting started a meeting on this attempt. Counts toward the per-IP daily limit and the in-flight spend reserve.';

-- Real spend on free meetings today (UTC), plus a reserve for meetings that
-- have started but not finished, so a burst of visitors can't all pass the
-- ceiling check before any of them has spent anything. The reserve is a
-- rough per-meeting estimate, deliberately on the high side.
create or replace function public.free_meeting_spend_today() returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  with free_users as (
    select distinct user_id from public.free_meeting_attempts
    where user_id is not null and started_at >= date_trunc('day', now()) - interval '1 day'
  ),
  spent as (
    select coalesce(sum(l.estimated_cost), 0) as amount
    from public.ai_usage_logs l
    where l.created_at >= date_trunc('day', now()) and l.user_id in (select user_id from free_users)
  ),
  in_flight as (
    select count(*) * 0.75 as amount
    from public.free_meeting_attempts
    where claimed_at >= now() - interval '30 minutes' and not completed
  )
  select spent.amount + in_flight.amount from spent, in_flight;
$$;
revoke execute on function public.free_meeting_spend_today() from public, anon, authenticated;
grant execute on function public.free_meeting_spend_today() to service_role;

-- The spend alert reads the same figure as the gate.
create or replace function public.check_free_meeting_spend() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ceiling numeric;
  spent numeric;
  pct numeric;
begin
  select free_meeting_daily_cost_ceiling_usd into ceiling from public.system_limits order by created_at desc limit 1;
  if ceiling is null then return; end if;

  spent := public.free_meeting_spend_today();
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
revoke execute on function public.check_free_meeting_spend() from public, anon, authenticated;

notify pgrst, 'reload schema';
