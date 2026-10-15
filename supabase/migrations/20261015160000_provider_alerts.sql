-- Provider alerts that reach the owner (owner, 15 October 2026).
--
-- On 15 October the Anthropic account ran out of credit at about 10:00 and
-- every Claude call fell back to GPT-4o for hours. The old check
-- (check_provider_health, every 15 minutes) did raise an alert, but it said
-- only that "calls landed on openai as a fallback", sat among months of old
-- alerts on the Admin page, and reached no one.
--
-- The providerHealth function replaces it: every 5 minutes, only while calls
-- are failing, it names the provider that's failing, why (out of credit, a
-- refused key, overloaded, timing out) and what to do, shows it in red on
-- the Admin page, and emails the owner once per incident, with a reminder
-- every 12 hours while it lasts.

alter table public.provider_health_alerts
  -- Why it's failing, in one word: credit, key, busy, slow or other.
  add column if not exists reason text,
  -- When the owner was last emailed about this incident.
  add column if not exists emailed_at timestamptz;

select cron.unschedule('check-provider-health')
where exists (select 1 from cron.job where jobname = 'check-provider-health');

select cron.schedule(
  'provider-health',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://bqqcobaspbkyofupmhfe.supabase.co/functions/v1/providerHealth',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"action":"check"}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (
    select 1 from public.ai_usage_logs
    where created_at > now() - interval '30 minutes' and status in ('fallback_used', 'error')
  );
  $$
);
