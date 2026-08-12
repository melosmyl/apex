-- Phase F: "if assistant usage rises while board meetings fall, she is
-- cannibalising the product" — the signal the product owner explicitly
-- required be captured from day one (assistant_events has been writing
-- since Phase A). This view is the read side, added now that there's real
-- usage data to look at.
create or replace view public.assistant_cannibalization_weekly as
select
  coalesce(bm.user_id, ae.user_id) as user_id,
  coalesce(bm.week, ae.week) as week,
  coalesce(bm.board_meetings, 0) as board_meetings,
  coalesce(ae.assistant_messages, 0) as assistant_messages
from (
  select created_by_id as user_id, date_trunc('week', created_at) as week, count(*) as board_meetings
  from public.board_meetings
  group by 1, 2
) bm
full outer join (
  select user_id, date_trunc('week', created_at) as week, count(*) as assistant_messages
  from public.assistant_events
  group by 1, 2
) ae on bm.user_id = ae.user_id and bm.week = ae.week;
