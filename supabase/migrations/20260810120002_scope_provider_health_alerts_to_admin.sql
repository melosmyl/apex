-- provider_health_alerts was readable/acknowledgeable by any authenticated
-- user (including anonymous free-meeting sessions, which also run as the
-- `authenticated` role) — these are operational signals for the product
-- owner, not something a founder or visitor should see or be able to
-- dismiss. Tighten to admin-only, matching the UI scoping in
-- ProviderHealthBanner.jsx.
drop policy "authenticated users can read provider health alerts" on public.provider_health_alerts;
drop policy "authenticated users can acknowledge provider health alerts" on public.provider_health_alerts;

create policy "admins can read provider health alerts"
  on public.provider_health_alerts for select to authenticated
  using (public.is_admin());

create policy "admins can acknowledge provider health alerts"
  on public.provider_health_alerts for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
