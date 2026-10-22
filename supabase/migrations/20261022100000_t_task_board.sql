-- Workstream T: the task board.
--
-- Every task gets a department (Product, Marketing, Sales, Finance, Legal or
-- Ops), shown as a coloured band and a chip, and a long task gets a short
-- title for the card, with the full wording kept in `title` (the results page
-- pairs the Chair's actions with their tasks by that exact wording).
--
--   - A new task's department, unless whoever makes it chooses one, comes
--     from the advisor who owns it: the library advisor's home department,
--     or, for an advisor the founder made, the words in their role; anything
--     else (the founder's own tasks, a pin turned into a task) is Ops.
--   - A title of seven words or fewer is already short. A longer one is
--     marked as waiting for a short title, which the shortenTaskTitles
--     function writes (a cheap model call). Until then the card shows the
--     full title. Changing the wording clears the old short title.
--   - Filing a task (its department, its short title) isn't progress: it
--     leaves the task's "last updated" time alone. The Chair's opening, the
--     Dashboard and "completed overnight" read that time as progress.
--   - Existing tasks get a department now, from their advisor, at no cost.
--     They aren't marked as waiting for a short title: that backfill is a
--     separate step, after a read-only count and the owner's yes.

set lock_timeout = '5s';

alter table public.tasks
  add column department text
    check (department in ('product', 'marketing', 'sales', 'finance', 'legal', 'ops')),
  add column short_title text
    check (short_title is null or char_length(short_title) between 1 and 80),
  add column short_title_pending boolean not null default false,
  -- Failed tries at a short title; after three the task stops waiting.
  add column short_title_attempts smallint not null default 0
    check (short_title_attempts between 0 and 10);

-- A task's "last updated" time moves only when something other than its
-- filing changes, and only this way: a change that's only filing (or only
-- the time itself) keeps the time it had. (Tasks used the shared
-- set_updated_at, which stamps every update.)
create function public.set_task_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  filing constant text[] := array['updated_at', 'department', 'short_title', 'short_title_pending', 'short_title_attempts'];
begin
  if (to_jsonb(new) - filing) is distinct from (to_jsonb(old) - filing) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
drop trigger set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_task_updated_at();

-- An advisor's home department (owner's decision, 22 October 2026).
create function public.department_for_advisor(p_library_key text, p_role text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p_library_key in ('product_strategist', 'ai_expert', 'felix-hart', 'nathan-cole', 'scientist',
                           'innovation_director', 'visionary') then 'product'
    when p_library_key in ('marketing_director', 'creative_director', 'theo-lindqvist') then 'marketing'
    when p_library_key in ('customer_advocate') then 'sales'
    when p_library_key in ('marcus-delgado', 'investor', 'arthur-penrose', 'capital_allocator') then 'finance'
    when p_library_key in ('legal_advisor', 'risk_analyst') then 'legal'
    when p_library_key in ('operator', 'supply_chain', 'people_culture', 'contrarian', 'chair') then 'ops'
    -- An advisor the founder made: by the words in their role.
    when p_role ~* '(account manager|account executive|\ysales|\yselling|\ycustomer|business development|partnership)' then 'sales'
    when p_role ~* '(\yfinanc|\yaccountant|\yaccounting|\ybookkeep|\ycfo\y|\yinvest(or|ors|ment|ments|ing)?\y|\ytreasur|\ycapital\y)' then 'finance'
    when p_role ~* '(\ylegal|\ylawyer|\ysolicitor|\yattorney|\ycounsel\y|\ycompliance|\yrisk)' then 'legal'
    when p_role ~* '(\yproducts?\y|\yux\y|\yui\y|\ytechnolog|\yengineer|\ydeveloper|\ycto\y|\yscien|\yinnovat|\yresearch)' then 'product'
    when p_role ~* '(\ymarketing|\ymarketer|\ybrand|\ycreative|\ydesigner|\ydesign\y|\ycontent|social media|\ycopywrit|\ycommunications)' then 'marketing'
    else 'ops'
  end
$$;

-- A task's department from its advisor: by id, or, for older tasks that only
-- name one, by name on the same company's board; otherwise Ops.
create function public.task_department_for(p_company uuid, p_advisor uuid, p_assigned_to text)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select public.department_for_advisor(a.library_key, a.role)
       from public.advisors a where a.id = p_advisor and a.company_id = p_company),
    (select public.department_for_advisor(a.library_key, a.role)
       from public.advisors a
      where p_advisor is null and a.company_id = p_company and lower(a.name) = lower(btrim(p_assigned_to))
      order by a.created_at limit 1),
    'ops')
$$;

create function public.title_words(p_title text)
returns integer
language sql immutable set search_path = ''
as $$
  select coalesce(array_length(regexp_split_to_array(btrim(coalesce(p_title, '')), '\s+'), 1), 0)
$$;

create function public.task_department_and_short_title()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.department is null then
    new.department := public.task_department_for(new.company_id, new.advisor_id, new.assigned_to);
  end if;
  if tg_op = 'INSERT' or new.title is distinct from old.title then
    -- New wording: a short title written for the old wording no longer fits.
    if tg_op = 'UPDATE' and new.short_title is not distinct from old.short_title then
      new.short_title := null;
    end if;
    new.short_title_pending := new.short_title is null and public.title_words(new.title) > 7;
    new.short_title_attempts := 0;
  end if;
  return new;
end;
$$;

-- Existing tasks: a department from their advisor. Filing, so their "last
-- updated" time stays as it was.
update public.tasks t
   set department = public.task_department_for(t.company_id, t.advisor_id, t.assigned_to)
 where t.department is null;

alter table public.tasks alter column department set not null;

create trigger task_department_and_short_title
  before insert or update of title on public.tasks
  for each row execute function public.task_department_and_short_title();

-- Finding a company's tasks waiting for a short title.
create index tasks_short_title_pending on public.tasks (company_id) where short_title_pending;

revoke all on function public.department_for_advisor(text, text), public.task_department_for(uuid, uuid, text),
  public.title_words(text), public.task_department_and_short_title(), public.set_task_updated_at()
  from public, anon, authenticated;

reset lock_timeout;
