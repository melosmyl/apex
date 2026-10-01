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

notify pgrst, 'reload schema';
