-- Workstream S (Teams), S2: members and invitations.
--
-- A company gets members, each with a role (owner, manager or member), and
-- invitations by email. This step only adds them; nobody sees a difference:
--   - every existing company gets one member, its founder, as owner; every
--     new company gets its creator as owner the moment it's made;
--   - the access rules still go by who made each row (S4 switches them to
--     membership, after the server understands it in S3);
--   - nobody can read or change members or invitations directly yet: the
--     member list (S4) and invites (S5) come through their own functions.
-- Account deletion moves from "the founder's account" to ownership: deleting
-- an account deletes the companies that person owns, as before; but if one
-- of them has other people in it, the deletion is refused until ownership is
-- handed over or the company is deleted (owner's decision, 16 October).

set lock_timeout = '5s';

-- The founder's account no longer deletes the company by itself (after a
-- handover the founder may not own it); who founded it stays recorded and
-- can't be changed. (First, so this step takes its strongest lock on
-- companies before anything else.)
alter table public.companies drop constraint companies_created_by_id_fkey;
create trigger keep_created_by before update of created_by_id on public.companies
  for each row when (new.created_by_id is distinct from old.created_by_id) execute function public.keep_created_by();

-- 1. Members ------------------------------------------------------------
create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create unique index company_members_one_owner on public.company_members (company_id) where role = 'owner';
create index company_members_user on public.company_members (user_id);
alter table public.company_members enable row level security;
revoke all on public.company_members from anon, authenticated;
revoke truncate on public.company_members from service_role;

-- A membership is one person in one company: only its role can change
-- (a handover changes roles; it never moves a membership).
create function public.company_members_fixed()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id or new.user_id is distinct from old.user_id then
    raise exception 'A membership can''t be moved to another company or person' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger company_members_fixed before update on public.company_members
  for each row execute function public.company_members_fixed();

-- Anonymous free-meeting visitors only ever own their own free company:
-- never invited into one, never a manager or member, never another's owner.
create function public.company_members_no_anonymous_guests()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce((select u.is_anonymous from auth.users u where u.id = new.user_id), true)
     and (new.role <> 'owner'
          or new.user_id is distinct from (select c.created_by_id from public.companies c where c.id = new.company_id)) then
    raise exception 'Only people with an account can join a company' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger company_members_no_anonymous_guests before insert or update on public.company_members
  for each row execute function public.company_members_no_anonymous_guests();

-- A company always has an owner: checked when the change is committed, so a
-- handover can demote one owner and promote the next in one go.
create function public.company_keeps_an_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.companies c where c.id = old.company_id)
     and not exists (select 1 from public.company_members m where m.company_id = old.company_id and m.role = 'owner') then
    raise exception 'A company must keep an owner' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger company_keeps_an_owner after delete or update on public.company_members
  deferrable initially deferred for each row execute function public.company_keeps_an_owner();

-- 2. Invitations --------------------------------------------------------
create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null check (role in ('manager', 'member')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),  -- sha-256 of the link's secret; the secret itself is never stored
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid,
  cancelled_at timestamptz,
  check (expires_at > created_at),
  check (accepted_at is null or cancelled_at is null),
  check ((accepted_at is null) = (accepted_by is null))
);
-- One open invitation per person per company (a resend replaces it).
create unique index company_invitations_one_open on public.company_invitations (company_id, email)
  where accepted_at is null and cancelled_at is null;
create index company_invitations_company on public.company_invitations (company_id);
create index company_invitations_email on public.company_invitations (email);
create index company_invitations_accepted_by on public.company_invitations (accepted_by) where accepted_by is not null;
alter table public.company_invitations enable row level security;
revoke all on public.company_invitations from anon, authenticated;
revoke truncate on public.company_invitations from service_role;

-- Invitations aren't kept once they're done with: 30 days after they're
-- accepted, cancelled or expired, every night.
select cron.schedule(
  'purge-old-invitations',
  '45 3 * * *',
  $$delete from public.company_invitations where coalesce(accepted_at, cancelled_at, expires_at) < now() - interval '30 days'$$
);

-- 3. Who you are in a company (for the rules S4 rewrites, and the server) --
-- About the signed-in person only; nothing about anyone else.
create function public.company_role(p_company uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select m.role from public.company_members m where m.company_id = p_company and m.user_id = auth.uid()
$$;
create function public.is_company_member(p_company uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.company_members m where m.company_id = p_company and m.user_id = auth.uid())
$$;
create function public.has_company_role(p_company uuid, p_roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.company_members m where m.company_id = p_company and m.user_id = auth.uid() and m.role = any (p_roles))
$$;
revoke all on function public.company_role(uuid), public.is_company_member(uuid), public.has_company_role(uuid, text[]) from public, anon;
grant execute on function public.company_role(uuid), public.is_company_member(uuid), public.has_company_role(uuid, text[]) to authenticated, service_role;

-- 4. Every company has its owner ------------------------------------------
insert into public.company_members (company_id, user_id, role)
select c.id, c.created_by_id, 'owner' from public.companies c
on conflict (company_id, user_id) do nothing;

create function public.company_owner_on_create()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.company_members (company_id, user_id, role) values (new.id, new.created_by_id, 'owner');
  return null;
end;
$$;
create trigger company_owner_on_create after insert on public.companies
  for each row execute function public.company_owner_on_create();

-- 5. Account deletion goes by ownership -----------------------------------
-- Deleting an account deletes the companies that person owns, with
-- everything in them (as before), and any company they founded that has no
-- owner at all; unless someone else is in one of theirs. Runs before
-- remember_departing_member (triggers run in name order).
create function public.delete_owned_companies()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Their companies: the ones they own, and any they founded that has no
  -- owner. Held still, so nobody joins one between the check and the delete.
  perform 1 from public.companies c
   where exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = old.id and m.role = 'owner')
      or (c.created_by_id = old.id and not exists (select 1 from public.company_members m where m.company_id = c.id and m.role = 'owner'))
     for update;
  if exists (select 1 from public.companies c
              where (exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = old.id and m.role = 'owner')
                     or (c.created_by_id = old.id and not exists (select 1 from public.company_members m where m.company_id = c.id and m.role = 'owner')))
                and exists (select 1 from public.company_members o where o.company_id = c.id and o.user_id <> old.id)) then
    raise exception 'This person owns a company other people belong to: hand it over or delete the company first'
      using errcode = 'P0001';
  end if;
  delete from public.companies c
   where exists (select 1 from public.company_members m where m.company_id = c.id and m.user_id = old.id and m.role = 'owner')
      or (c.created_by_id = old.id and not exists (select 1 from public.company_members m where m.company_id = c.id and m.role = 'owner'));
  -- Their email isn't kept on invitations: neither the ones they accepted
  -- nor any still addressed to them.
  delete from public.company_invitations
   where accepted_by = old.id or (old.email is not null and email = lower(old.email));
  return old;
end;
$$;
create trigger delete_owned_companies before delete on auth.users
  for each row execute function public.delete_owned_companies();

-- The name of someone who leaves work behind: now "in a company they don't
-- own" (their own companies are already gone by the time this runs).
create or replace function public.remember_departing_member()
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
      where not exists (select 1 from public.company_members m
                         where m.company_id = left_behind.company_id and m.user_id = old.id and m.role = 'owner')) then
    insert into public.former_members (user_id, display_name)
    select old.id, p.display_name from public.profiles p where p.id = old.id
    on conflict (user_id) do update set display_name = excluded.display_name, left_at = now();
  end if;
  return old;
end;
$$;

revoke all on function public.company_members_fixed(), public.company_members_no_anonymous_guests(), public.company_keeps_an_owner(),
  public.company_owner_on_create(), public.delete_owned_companies() from public, anon, authenticated;

reset lock_timeout;
