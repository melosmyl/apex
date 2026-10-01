-- Security checkpoint, Part C: database rules that hold even if code slips.

-- Re-adding foreign keys locks the tables involved until commit. Give up
-- rather than queue behind live traffic; run it in a quiet window.
set lock_timeout = '5s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------------
-- 1. Company ownership on every insert and update of company data.
--
-- The policies only checked created_by_id = auth.uid(), so a user could
-- create (or move) rows carrying someone else's company_id. The owner can't
-- see those rows, but the server read them into that company's meetings,
-- Chair opening and reminders. Admins keep update access via is_admin().
-- ---------------------------------------------------------------------
create or replace function public.owns_company(p_company_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.created_by_id = auth.uid()
  );
$$;

alter policy "advisors_owner_insert" on public.advisors
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "advisors_owner_or_admin_update" on public.advisors
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "projects_owner_insert" on public.projects
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "projects_owner_or_admin_update" on public.projects
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "board_meetings_owner_insert" on public.board_meetings
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "board_meetings_owner_or_admin_update" on public.board_meetings
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

-- meeting_messages.company_id is nullable; a null company can't be planted
-- into anyone's company.
alter policy "meeting_messages_owner_insert" on public.meeting_messages
  with check (created_by_id = auth.uid() and (company_id is null or public.owns_company(company_id)));
alter policy "meeting_messages_owner_or_admin_update" on public.meeting_messages
  with check (public.is_admin() or (created_by_id = auth.uid() and (company_id is null or public.owns_company(company_id))));

alter policy "vms_owner_insert" on public.voice_meeting_sessions
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "vms_owner_or_admin_update" on public.voice_meeting_sessions
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "decisions_owner_insert" on public.decisions
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "decisions_owner_or_admin_update" on public.decisions
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "tasks_owner_insert" on public.tasks
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "tasks_owner_or_admin_update" on public.tasks
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "documents_owner_insert" on public.documents
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "documents_owner_or_admin_update" on public.documents
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "pins_owner_insert" on public.pins
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "pins_owner_or_admin_update" on public.pins
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "subscriptions_owner_insert" on public.subscriptions
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "subscriptions_owner_or_admin_update" on public.subscriptions
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "notes_owner_insert" on public.notes
  with check (created_by_id = auth.uid() and public.owns_company(company_id));
alter policy "notes_owner_or_admin_update" on public.notes
  with check (public.is_admin() or (created_by_id = auth.uid() and public.owns_company(company_id)));

alter policy "assistant_events_self_insert" on public.assistant_events
  with check (user_id = auth.uid() and (company_id is null or public.owns_company(company_id)));

-- ---------------------------------------------------------------------
-- 2. Founders may only change the meeting fields the app edits.
--
-- With the whole row writable, an owner could reset status and re-run paid
-- meeting steps. The browser only ever writes these four columns.
-- ---------------------------------------------------------------------
revoke update on public.board_meetings from anon, authenticated;
grant update (independent_responses, founder_decision, founder_decision_notes, share_token)
  on public.board_meetings to authenticated;

-- ---------------------------------------------------------------------
-- 3. Anonymous caps that also see rows from the same statement and that
--    apply to server (service-role) writes too.
--
-- The restrictive RLS policies count rows that existed before the insert,
-- so one multi-row insert could pass them all, and service-role inserts
-- skip RLS entirely. An AFTER STATEMENT trigger sees every row the
-- statement wrote. The RLS policies stay as a first line.
-- ---------------------------------------------------------------------
create or replace function public.enforce_anonymous_caps() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cap integer := TG_ARGV[0]::integer;
  extra_filter text := coalesce(TG_ARGV[1], 'true');
  over_cap boolean;
begin
  execute format(
    'select exists (
       select 1
       from (select distinct created_by_id from new_rows) n
       join auth.users u on u.id = n.created_by_id and u.is_anonymous
       where (select count(*) from public.%I t where t.created_by_id = n.created_by_id and (%s)) > %s
     )', TG_TABLE_NAME, extra_filter, cap)
  into over_cap;
  if over_cap then
    raise exception 'Free-meeting limit reached for %', TG_TABLE_NAME using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
revoke execute on function public.enforce_anonymous_caps() from public, anon, authenticated;

drop trigger if exists anonymous_cap_companies on public.companies;
create trigger anonymous_cap_companies after insert on public.companies
  referencing new table as new_rows for each statement
  execute function public.enforce_anonymous_caps('1');

drop trigger if exists anonymous_cap_advisors on public.advisors;
create trigger anonymous_cap_advisors after insert on public.advisors
  referencing new table as new_rows for each statement
  execute function public.enforce_anonymous_caps('6');

-- One live meeting per visitor; a failed one can be retried (Part D), up to
-- three meeting rows in all.
drop trigger if exists anonymous_cap_meetings_live on public.board_meetings;
create trigger anonymous_cap_meetings_live after insert on public.board_meetings
  referencing new table as new_rows for each statement
  execute function public.enforce_anonymous_caps('1', 't.status <> ''failed''');
drop trigger if exists anonymous_cap_meetings_total on public.board_meetings;
create trigger anonymous_cap_meetings_total after insert on public.board_meetings
  referencing new table as new_rows for each statement
  execute function public.enforce_anonymous_caps('3');

-- ---------------------------------------------------------------------
-- 4. Stored file paths are written by the server only.
--
-- getDocumentDownloadUrl / getSharedDocument sign whatever path these
-- columns hold. The browser only ever writes file_url (a link it supplies);
-- generate-deliverable writes these two with the service role.
-- ---------------------------------------------------------------------
create or replace function public.guard_document_file_paths() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (new.native_file_url is not null or new.pdf_file_url is not null) then
      raise exception 'File paths are set by the server' using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'UPDATE' and (new.native_file_url is distinct from old.native_file_url
                             or new.pdf_file_url is distinct from old.pdf_file_url) then
      raise exception 'File paths are set by the server' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_document_file_paths on public.documents;
create trigger guard_document_file_paths before insert or update on public.documents
  for each row execute function public.guard_document_file_paths();

-- ---------------------------------------------------------------------
-- 5. Deleting a company (or an account) deletes what hangs off it.
--
-- These foreign keys had no ON DELETE action, so deleting a company that
-- had notes, reminders, events or a progression tree failed, which also made
-- the 30-day anonymous cleanup and "Delete company" fail silently. Every
-- created_by_id -> auth.users link now cascades too, so deleting an account
-- removes its rows.
-- ---------------------------------------------------------------------
create or replace function pg_temp.set_fk_on_delete(p_table text, p_column text, p_ref text, p_action text)
returns void language plpgsql as $$
declare
  con text;
begin
  select c.conname into con
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f' and c.conrelid = ('public.' || p_table)::regclass and a.attname = p_column
  limit 1;
  if con is not null then
    execute format('alter table public.%I drop constraint %I', p_table, con);
  end if;
  execute format('alter table public.%I add constraint %I foreign key (%I) references %s(id) on delete %s',
                 p_table, p_table || '_' || p_column || '_fkey', p_column, p_ref, p_action);
end;
$$;

select pg_temp.set_fk_on_delete('notes', 'company_id', 'public.companies', 'cascade');
select pg_temp.set_fk_on_delete('notes', 'routed_meeting_id', 'public.board_meetings', 'set null');
select pg_temp.set_fk_on_delete('assistant_events', 'company_id', 'public.companies', 'cascade');
select pg_temp.set_fk_on_delete('assistant_events', 'user_id', 'auth.users', 'cascade');
select pg_temp.set_fk_on_delete('assistant_events', 'note_id', 'public.notes', 'set null');
select pg_temp.set_fk_on_delete('assistant_events', 'task_id', 'public.tasks', 'set null');
select pg_temp.set_fk_on_delete('assistant_events', 'meeting_id', 'public.board_meetings', 'set null');
select pg_temp.set_fk_on_delete('assistant_events', 'progression_node_id', 'public.progression_nodes', 'set null');
select pg_temp.set_fk_on_delete('assistant_chases', 'company_id', 'public.companies', 'cascade');
select pg_temp.set_fk_on_delete('assistant_chases', 'task_id', 'public.tasks', 'cascade');
select pg_temp.set_fk_on_delete('progression_trees', 'company_id', 'public.companies', 'cascade');
select pg_temp.set_fk_on_delete('progression_nodes', 'company_id', 'public.companies', 'cascade');
select pg_temp.set_fk_on_delete('progression_nodes', 'tree_id', 'public.progression_trees', 'cascade');
select pg_temp.set_fk_on_delete('progression_node_completions', 'company_id', 'public.companies', 'cascade');
select pg_temp.set_fk_on_delete('progression_node_completions', 'node_id', 'public.progression_nodes', 'cascade');

select pg_temp.set_fk_on_delete(t, 'created_by_id', 'auth.users', 'cascade')
from unnest(array[
  'companies', 'advisors', 'projects', 'board_meetings', 'meeting_messages', 'voice_meeting_sessions',
  'decisions', 'tasks', 'documents', 'document_download_logs', 'pins', 'subscriptions',
  'notes', 'assistant_chases', 'progression_trees', 'progression_nodes', 'progression_node_completions'
]) as t;

-- ---------------------------------------------------------------------
-- 6. Raw IPs in the share-link access log are kept 24 hours, not forever.
--    The longest rate-limit window that reads it is 60 minutes.
-- ---------------------------------------------------------------------
select cron.schedule(
  'purge-public-access-log',
  '40 3 * * *',
  $$ delete from public.public_access_log where created_at < now() - interval '24 hours'; $$
);

notify pgrst, 'reload schema';
