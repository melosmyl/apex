-- Phase 4.1's cleanupExpiredAnonymousUsers has existed since 2026-08-09 but
-- was never scheduled. Unlike check_provider_health/check_free_meeting_spend
-- (plain plpgsql functions cron can call directly), this one has to stay an
-- Edge Function — it calls db.auth.admin.deleteUser(), which only the Admin
-- API exposes; a raw SQL delete against auth.users would leave GoTrue's own
-- bookkeeping (sessions, refresh tokens, identities) orphaned.
--
-- Reaching an Edge Function from pg_cron means an authenticated HTTP call
-- (pg_net), which means the service-role key has to live somewhere the cron
-- job can read it. This migration only wires up the plumbing — it reads the
-- key from Vault by name ('service_role_key') rather than embedding it, so
-- nothing secret ever lands in a migration file or git history. The secret
-- itself still has to be created once, by hand, by whoever holds it — see
-- the accompanying instructions; this migration is a no-op cron job (it'll
-- run and no-op with an auth error) until that secret exists.
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cleanup-expired-anonymous-users',
  '0 3 * * *', -- daily at 03:00 UTC, well outside any real usage window
  $$
  select net.http_post(
    url := 'https://bqqcobaspbkyofupmhfe.supabase.co/functions/v1/cleanupExpiredAnonymousUsers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
