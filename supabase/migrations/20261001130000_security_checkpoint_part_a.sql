-- Security checkpoint, Part A: urgent fixes.
--
-- 1. profiles_update_own let any signed-in user (anonymous ones included)
--    update every column of their own profile, including `role`. Setting
--    role = 'admin' passed is_admin(), every *_owner_or_admin policy and the
--    adminApi / testAdvisor admin gates. Nothing in the app writes profiles
--    (they're created by handle_new_user and read via get_my_profile), so the
--    policy and the write privileges go. Admins are promoted from the SQL
--    editor or with the service role.
drop policy if exists "profiles_update_own" on public.profiles;
revoke insert, update, delete, truncate on table public.profiles from anon, authenticated;

-- 2. The usage view ran with its owner's rights and was readable by anon and
--    authenticated, exposing every user's weekly meeting and assistant
--    counts. Only adminApi reads it, with the service role.
alter view public.assistant_cannibalization_weekly set (security_invoker = true);
revoke all on public.assistant_cannibalization_weekly from anon, authenticated;

-- 3. The two alert checks are security definer and were callable by anyone
--    over /rest/v1/rpc. Only their pg_cron jobs (running as the owner) need them.
revoke execute on function public.check_provider_health() from public, anon, authenticated;
revoke execute on function public.check_free_meeting_spend() from public, anon, authenticated;
alter function public.check_provider_health() set search_path = public, pg_temp;
alter function public.check_free_meeting_spend() set search_path = public, pg_temp;

-- 4. Anyone signed in could insert download-log rows with any owner or
--    document. Only getDocumentDownloadUrl writes this table, with the
--    service role.
drop policy if exists "ddl_anyone_authenticated_insert" on public.document_download_logs;

notify pgrst, 'reload schema';
