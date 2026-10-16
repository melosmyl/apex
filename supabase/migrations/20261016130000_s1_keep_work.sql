-- Workstream S (Teams), S1: keep people's work when they go.
--
-- Owner's decision: everything a member makes belongs to the company; when
-- someone leaves, the company keeps it. Today deleting an account deletes
-- every row that person created, in every table (security checkpoint part C
-- added those cascades). This keeps a company's content when the person who
-- made it is deleted, and remembers their name for "made by".
--
-- Nothing changes for anyone today:
--   - A company is still deleted with its founder's account (that rule moves
--     to membership in S2), and everything in it goes with the company, as
--     every content table cascades from companies.
--   - Personal records still go with the person: their profile, their
--     download log, their assistant events and nudges, and the old
--     per-advisor subscriptions. So do messages from the old voice meetings
--     (meeting_messages), which can belong to no company at all.
--   - A departing person's name is kept only if something of theirs stays
--     behind in a company that isn't theirs, which can't happen before Teams.

-- Dropping a foreign key briefly locks auth.users (sign-ins wait): give up
-- after 5 seconds rather than queue behind a busy moment; just run it again.
set lock_timeout = '5s';

-- 1. Company content no longer depends on the account of the person who made
--    it. created_by_id stays (who made it), without the link that deleted it.
alter table public.advisors                     drop constraint advisors_created_by_id_fkey;
alter table public.projects                     drop constraint projects_created_by_id_fkey;
alter table public.board_meetings               drop constraint board_meetings_created_by_id_fkey;
alter table public.voice_meeting_sessions       drop constraint voice_meeting_sessions_created_by_id_fkey;
alter table public.decisions                    drop constraint decisions_created_by_id_fkey;
alter table public.tasks                        drop constraint tasks_created_by_id_fkey;
alter table public.documents                    drop constraint documents_created_by_id_fkey;
alter table public.pins                         drop constraint pins_created_by_id_fkey;
alter table public.notes                        drop constraint notes_created_by_id_fkey;
alter table public.progression_trees            drop constraint progression_trees_created_by_id_fkey;
alter table public.progression_nodes            drop constraint progression_nodes_created_by_id_fkey;
alter table public.progression_node_completions drop constraint progression_node_completions_created_by_id_fkey;
alter table public.task_runs                    drop constraint task_runs_created_by_id_fkey;

-- Who made a row can't be changed afterwards, by anyone (the link used to
-- make sure it named a real account; now it's fixed at creation instead).
create function public.keep_created_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_by_id := old.created_by_id;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['advisors', 'projects', 'board_meetings', 'meeting_messages', 'voice_meeting_sessions', 'decisions',
                           'tasks', 'documents', 'pins', 'notes', 'progression_trees', 'progression_nodes',
                           'progression_node_completions', 'task_runs'] loop
    execute format('create trigger keep_created_by before update of created_by_id on public.%I for each row
                    when (new.created_by_id is distinct from old.created_by_id) execute function public.keep_created_by()', t);
  end loop;
end;
$$;

-- 2. Who did it, recorded by the database.
alter table public.board_meetings add column decided_by uuid;      -- who made the founder's call
alter table public.documents add column approved_by_user_id uuid;  -- who approved it
alter table public.tasks add column assignee_user_id uuid;         -- a person the task is assigned to (checked and used from S6)
create index tasks_assignee_user on public.tasks (assignee_user_id) where assignee_user_id is not null;

-- From the browser, worked out here whatever was sent: the person making the
-- call (or approving), kept as it was when the call itself doesn't change,
-- cleared when it's taken back ("undecided" counts as no call). The server
-- (service role) may say who did it, for work it does on someone's behalf.
create function public.record_decided_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(new.founder_decision, 'undecided') = 'undecided' then
    new.decided_by := null;
  elsif current_user not in ('anon', 'authenticated') then
    null;  -- the server's value stands
  elsif tg_op = 'UPDATE' and new.founder_decision is not distinct from old.founder_decision then
    new.decided_by := old.decided_by;
  else
    new.decided_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger record_decided_by before insert or update on public.board_meetings
  for each row execute function public.record_decided_by();

create function public.record_approved_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.approval_status is distinct from 'approved' then
    new.approved_by_user_id := null;
  elsif current_user not in ('anon', 'authenticated') then
    null;  -- the server's value stands (taskRun passes it from S3)
  elsif tg_op = 'UPDATE' and new.approval_status is not distinct from old.approval_status then
    new.approved_by_user_id := old.approved_by_user_id;
  else
    new.approved_by_user_id := auth.uid();
  end if;
  return new;
end;
$$;
create trigger record_approved_by before insert or update on public.documents
  for each row execute function public.record_approved_by();

-- 3. The name of someone who leaves something behind, for "made by Sam
--    (left)", "decided by", "approved by" and "assigned to". Only the name;
--    read through the company's member list later (S4), never directly.
--    (S2 rewrites the "company that isn't theirs" test for membership.)
create table public.former_members (
  user_id uuid primary key,
  display_name text,
  left_at timestamptz not null default now()
);
alter table public.former_members enable row level security;
revoke all on public.former_members from anon, authenticated;

create function public.remember_departing_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(old.is_anonymous, false) then
    return old;
  end if;
  if exists (
       select 1 from (
         select company_id from public.advisors where created_by_id = old.id
         union all select company_id from public.projects where created_by_id = old.id
         union all select company_id from public.board_meetings where created_by_id = old.id or decided_by = old.id
         union all select company_id from public.voice_meeting_sessions where created_by_id = old.id
         union all select company_id from public.decisions where created_by_id = old.id
         union all select company_id from public.tasks where created_by_id = old.id or assignee_user_id = old.id
         union all select company_id from public.documents where created_by_id = old.id or approved_by_user_id = old.id
         union all select company_id from public.pins where created_by_id = old.id
         union all select company_id from public.notes where created_by_id = old.id
         union all select company_id from public.progression_trees where created_by_id = old.id
         union all select company_id from public.progression_nodes where created_by_id = old.id
         union all select company_id from public.progression_node_completions where created_by_id = old.id
         union all select company_id from public.task_runs where created_by_id = old.id
       ) left_behind
       join public.companies c on c.id = left_behind.company_id
      where c.created_by_id <> old.id) then
    insert into public.former_members (user_id, display_name)
    select old.id, p.display_name from public.profiles p where p.id = old.id
    on conflict (user_id) do update set display_name = excluded.display_name, left_at = now();
  end if;
  return old;
end;
$$;
create trigger remember_departing_member before delete on auth.users
  for each row execute function public.remember_departing_member();

-- 4. A departed person's name goes once nothing of theirs is left in any
--    company (checked whenever companies are deleted).
create function public.forget_former_members_without_work()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.former_members fm
   where not exists (select 1 from public.advisors where created_by_id = fm.user_id)
     and not exists (select 1 from public.projects where created_by_id = fm.user_id)
     and not exists (select 1 from public.board_meetings where created_by_id = fm.user_id or decided_by = fm.user_id)
     and not exists (select 1 from public.voice_meeting_sessions where created_by_id = fm.user_id)
     and not exists (select 1 from public.decisions where created_by_id = fm.user_id)
     and not exists (select 1 from public.tasks where created_by_id = fm.user_id or assignee_user_id = fm.user_id)
     and not exists (select 1 from public.documents where created_by_id = fm.user_id or approved_by_user_id = fm.user_id)
     and not exists (select 1 from public.pins where created_by_id = fm.user_id)
     and not exists (select 1 from public.notes where created_by_id = fm.user_id)
     and not exists (select 1 from public.progression_trees where created_by_id = fm.user_id)
     and not exists (select 1 from public.progression_nodes where created_by_id = fm.user_id)
     and not exists (select 1 from public.progression_node_completions where created_by_id = fm.user_id)
     and not exists (select 1 from public.task_runs where created_by_id = fm.user_id);
  return null;
end;
$$;
create trigger forget_former_members_without_work after delete on public.companies
  for each statement execute function public.forget_former_members_without_work();

revoke all on function public.keep_created_by(), public.remember_departing_member(), public.record_decided_by(),
  public.record_approved_by(), public.forget_former_members_without_work() from public, anon, authenticated;

-- 5. Finding a person's work quickly (the checks above, and the member rules
--    to come), by who made it, decided it or approved it.
do $$
declare t text;
begin
  foreach t in array array['advisors', 'projects', 'board_meetings', 'voice_meeting_sessions', 'decisions', 'tasks', 'documents',
                           'pins', 'progression_trees', 'progression_nodes', 'progression_node_completions', 'task_runs'] loop
    execute format('create index if not exists %I on public.%I (created_by_id)', t || '_created_by_id_idx', t);
  end loop;
end;
$$;
create index board_meetings_decided_by_idx on public.board_meetings (decided_by) where decided_by is not null;
create index documents_approved_by_idx on public.documents (approved_by_user_id) where approved_by_user_id is not null;

reset lock_timeout;
