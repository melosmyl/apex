-- Workstream S (Teams), S0: a name for every person.
--
-- Teams will show who made what ("Added by Sam") and who sent an invite, so
-- each person needs a display name. Nobody is asked for one up front (owner,
-- 16 October 2026): it's asked when it first matters, on accepting an invite
-- or sending a first one. Until then:
--   - a name given at sign-up is used (Google gives one; an email sign-up
--     could too), for new sign-ups and, once, for existing people;
--   - anyone can set or change it on their account page.
--
-- profiles stays closed to direct writes (security checkpoint, 1 October):
-- the name is set only through set_my_display_name(), which can change
-- nothing else.

alter table public.profiles add column display_name text
  check (display_name is null or (char_length(display_name) between 1 and 80 and display_name = btrim(display_name)));

-- A name tidied for showing to others: invisible and direction-changing
-- characters removed, other control characters and runs of spaces made one
-- space, at most 80 characters, trimmed (after cutting, so it never ends in a
-- space). Null when nothing is left.
create function public.clean_display_name(p_name text)
returns text
language sql immutable set search_path = ''
as $$
  select nullif(btrim(left(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_name, ''), '[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]', '', 'g'),
        '[[:cntrl:]]', ' ', 'g'),
      '\s+', ' ', 'g')), 80)), '')
$$;

-- The name given at sign-up, if any: full_name, else name, text values only.
create function public.display_name_from_signup(p_meta jsonb)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(
    case when jsonb_typeof(p_meta -> 'full_name') = 'string' then public.clean_display_name(p_meta ->> 'full_name') end,
    case when jsonb_typeof(p_meta -> 'name') = 'string' then public.clean_display_name(p_meta ->> 'name') end)
$$;

-- New sign-ups: as before, plus the name given at sign-up (not for anonymous
-- free-meeting visitors). Now with a fixed search_path, which it lacked.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email,
          case when coalesce(new.is_anonymous, false) then null else public.display_name_from_signup(new.raw_user_meta_data) end);
  return new;
end;
$$;

-- Existing people with a name from sign-up (in practice, Google): once.
update public.profiles p
   set display_name = public.display_name_from_signup(u.raw_user_meta_data)
  from auth.users u
 where u.id = p.id
   and p.display_name is null
   and not coalesce(u.is_anonymous, false)
   and public.display_name_from_signup(u.raw_user_meta_data) is not null;

-- Set or change your own name. Not for anonymous free-meeting visitors: the
-- account itself is checked, not the session's token, which can lag behind
-- for a while after a visitor keeps their board.
create function public.set_my_display_name(p_name text)
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean text := public.clean_display_name(p_name);
  saved public.profiles;
begin
  if me is null or coalesce((select u.is_anonymous from auth.users u where u.id = me), true) then
    raise exception 'Sign in to set your name' using errcode = '42501';
  end if;
  if clean is null then
    raise exception 'Your name can''t be empty' using errcode = '22023';
  end if;
  update public.profiles set display_name = clean where id = me returning * into saved;
  if saved.id is null then
    raise exception 'No profile for this account' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;

revoke all on function public.clean_display_name(text), public.display_name_from_signup(jsonb) from public, anon, authenticated;
revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.set_my_display_name(text) to authenticated;
