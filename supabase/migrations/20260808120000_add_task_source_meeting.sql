-- Links a task back to the board meeting whose resolution prompted it, so
-- follow-up can distinguish commitments made in the boardroom from ad-hoc work.
-- Nullable: tasks created outside the boardroom have no source meeting.
alter table public.tasks
  add column if not exists source_meeting_id uuid references public.board_meetings(id) on delete set null;

create index if not exists tasks_source_meeting_id_idx
  on public.tasks (source_meeting_id)
  where source_meeting_id is not null;
