-- Stores the advisor's in-voice acknowledgment of a completed commitment
-- (a task with source_meeting_id) — generated once, on completion, and shown
-- inline on the task card. Null for tasks that never had a commitment behind
-- them, or where completion didn't trigger this flow.
alter table public.tasks
  add column if not exists advisor_acknowledgment text,
  add column if not exists advisor_acknowledgment_by text,
  add column if not exists advisor_acknowledgment_at timestamptz;
