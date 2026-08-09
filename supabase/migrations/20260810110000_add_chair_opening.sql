-- The Chair's opening statement — what has changed since the last meeting:
-- tasks completed, the founder's response to the last resolution, and
-- outstanding commitments (with a direct, curious ask for anything overdue).
-- Null on a company's first meeting, since there is nothing yet to open with.
alter table public.board_meetings
  add column if not exists chair_opening text;
