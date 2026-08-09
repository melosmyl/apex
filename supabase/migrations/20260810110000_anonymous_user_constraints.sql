-- Phase 4.1 — anonymous free-meeting visitors use real Supabase anonymous
-- auth (a genuine auth.uid(), just flagged is_anonymous in the JWT), so
-- every existing RLS policy and created_by_id default keeps working
-- unchanged. These are ADDITIONAL restrictive policies layered on top —
-- restrictive policies AND with permissive ones rather than OR, so a real
-- (non-anonymous) founder is completely unaffected, and the existing
-- owner-or-admin policies never need to change.
--
-- Scope: exactly one company, exactly one board meeting, zero documents,
-- zero tasks. Enforced here as a backstop even though the normal product
-- flow never calls these tables directly as anonymous — a determined
-- visitor could otherwise bypass the edge functions entirely with a raw
-- REST call using their own anonymous session token.
create or replace function public.is_anonymous_user() returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

create policy "anonymous_users_one_company"
  on public.companies as restrictive for insert to public
  with check (
    not public.is_anonymous_user()
    or not exists (select 1 from public.companies where created_by_id = auth.uid())
  );

create policy "anonymous_users_no_company_delete"
  on public.companies as restrictive for delete to public
  using (not public.is_anonymous_user());

create policy "anonymous_users_capped_advisors"
  on public.advisors as restrictive for insert to public
  with check (
    not public.is_anonymous_user()
    or (select count(*) from public.advisors where created_by_id = auth.uid()) < 6
  );

create policy "anonymous_users_no_advisor_delete"
  on public.advisors as restrictive for delete to public
  using (not public.is_anonymous_user());

create policy "anonymous_users_one_meeting"
  on public.board_meetings as restrictive for insert to public
  with check (
    not public.is_anonymous_user()
    or not exists (select 1 from public.board_meetings where created_by_id = auth.uid())
  );

create policy "anonymous_users_no_meeting_delete"
  on public.board_meetings as restrictive for delete to public
  using (not public.is_anonymous_user());

create policy "anonymous_users_no_documents"
  on public.documents as restrictive for insert to public
  with check (not public.is_anonymous_user());

create policy "anonymous_users_no_tasks"
  on public.tasks as restrictive for insert to public
  with check (not public.is_anonymous_user());
