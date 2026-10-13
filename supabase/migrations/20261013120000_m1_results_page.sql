-- Workstream M1: the six-section results page.
--
-- Each of the Chair's "next 24 hours" actions becomes a task that knows what
-- kind of work it is (research, draft, calculate or plan; empty when only
-- the founder can do it), which advisor owns it (by id, not just a name),
-- and when it counts as done. The brief for the work goes in the existing
-- `description`. Stage 2's task runner reads all four.
--
-- The founder's answers to the "decisions only you can make" questions are
-- saved with the meeting, next to their call on the verdict
-- (founder_decision: accept / modify / reject), so outcome tracking has both.

alter table public.tasks
  add column if not exists task_type text
    check (task_type in ('research', 'draft', 'calculate', 'plan')),
  add column if not exists advisor_id uuid references public.advisors(id) on delete set null,
  add column if not exists done_when text;

create index if not exists tasks_advisor_id_idx on public.tasks (advisor_id);

-- A task's advisor must sit on the same company's board. The founder can edit
-- their own tasks, so this is checked in the database rather than trusted to
-- the server code that creates them.
create or replace function public.task_advisor_same_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.advisor_id is not null and not exists (
    select 1 from public.advisors a where a.id = new.advisor_id and a.company_id = new.company_id
  ) then
    raise exception 'task advisor must belong to the same company';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_advisor_same_company on public.tasks;
create trigger tasks_advisor_same_company
  before insert or update of advisor_id, company_id on public.tasks
  for each row execute function public.task_advisor_same_company();

-- The answers: {"0": "yes", "1": "not_sure", ...}, keyed by the question's
-- position. Small and shaped, since the founder writes it from the browser.
alter table public.board_meetings
  add column if not exists founder_answers jsonb
    check (
      founder_answers is null or (
        jsonb_typeof(founder_answers) = 'object'
        and pg_column_size(founder_answers) < 2000
      )
    );

grant update (founder_answers) on public.board_meetings to authenticated;
