-- Fixes infinite recursion in profiles_select_own_or_admin (42P17).
--
-- The original policy (20260806000000_initial_schema.sql) inlined the
-- admin check as a raw subquery against public.profiles itself:
--
--   exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
--
-- That subquery runs as the calling role, so it re-triggers this same
-- select policy on profiles, which re-triggers it again — infinite loop.
-- public.is_admin() exists specifically to do this check safely (security
-- definer, so it reads profiles as the table owner and bypasses profiles'
-- own RLS) and every other table's policies already call it correctly.
-- profiles' own policy just predates is_admin() in the same migration file
-- and was never updated to use it.
--
-- No behaviour change intended — same access (self, or admin), just
-- evaluated through the helper that doesn't recurse.

drop policy if exists "profiles_select_own_or_admin" on public.profiles;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    id = auth.uid()
    or public.is_admin()
  );
