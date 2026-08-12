-- Phase E: the Assistant now owns proactive accountability chasing (moved
-- off the Chair's opening statement, which keeps only its recap/
-- acknowledgment behavior — see the startBoardMeeting diff in the same
-- deploy). prepareAccountabilityChases (cron-triggered, daily) writes rows
-- here; shown_at/dismissed_at track whether a founder has actually seen one
-- yet, decoupling "prepared" from "shown" since generation runs on a
-- schedule but display is still gated by the founder's own session budget.
create table public.assistant_chases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  task_id uuid not null references public.tasks(id),
  created_by_id uuid not null references auth.users(id),
  chase_text text not null,
  generated_at timestamptz not null default now(),
  shown_at timestamptz,
  dismissed_at timestamptz
);

alter table public.assistant_chases enable row level security;

-- No RLS policies for select/insert/update: this table is written by
-- prepareAccountabilityChases and read/updated by getSessionInterjection,
-- both service-role — a founder never touches it directly, same reasoning
-- as assistant_events' original design (before that table needed a
-- client-side self-insert for note_captured; this one never does).
create index assistant_chases_company_id_shown_at_idx on public.assistant_chases (company_id, shown_at);
create index assistant_chases_task_id_idx on public.assistant_chases (task_id);
