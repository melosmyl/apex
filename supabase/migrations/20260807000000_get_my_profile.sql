-- =========================================================================
-- HISTORICAL RECORD — already applied directly via the Supabase SQL Editor,
-- same as 20260806000000_initial_schema.sql, before this repo's migration
-- history was consistently pushed via the CLI. Confirmed live 2026-08-13
-- via `supabase db diff`: this exact function definition exists in
-- production. Filed here as a record, not to be re-run.
-- =========================================================================

-- get_my_profile() — the one function every authenticated session depends
-- on: AuthContext calls it via RPC on login and on every auth-state change,
-- and it's the sole source of `user.role` app-wide (see base44Client.js's
-- fetchProfile()). SECURITY DEFINER is what lets it read `profiles` safely
-- as the table owner, bypassing profiles' own RLS — this is exactly why it
-- never hit the profiles_select_own_or_admin recursion bug that a plain,
-- non-definer query against profiles would (see
-- 20260813190000_fix_profiles_select_recursion.sql).

create or replace function public.get_my_profile()
returns public.profiles
language sql
stable security definer
as $function$
  select * from public.profiles where id = auth.uid();
$function$;
