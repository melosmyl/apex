-- Same pattern as 20260810121500_schedule_anonymous_cleanup.sql — an Edge
-- Function reached from pg_cron via pg_net, authenticated with the
-- service-role key read from Vault (name 'service_role_key', already
-- populated). This is what makes accountability chasing genuinely
-- proactive: the cron precomputes candidate chases daily; the founder still
-- only ever sees one via their own session's interjection budget
-- (getSessionInterjection), never pushed at them directly.
select cron.schedule(
  'prepare-accountability-chases',
  '0 4 * * *', -- daily at 04:00 UTC, after the 03:00 anonymous-cleanup job
  $$
  select net.http_post(
    url := 'https://bqqcobaspbkyofupmhfe.supabase.co/functions/v1/prepareAccountabilityChases',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
