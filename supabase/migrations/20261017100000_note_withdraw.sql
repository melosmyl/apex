-- The founder's notes, from the owner's re-test (16 October 2026).
--
-- 1. A note the board hasn't heard can be withdrawn: it is marked
--    withdrawn_at and never reaches the board, the Chair or a new round.
--    It is only withdrawn if the meeting is still in the state the server
--    checked (status and the running step's claim), so a round that starts
--    at that moment can't take it.
-- 2. A note given before the meeting (before_meeting) and a withdrawn note
--    no longer count towards the six notes a meeting can take; a meeting
--    keeps at most 20 in all, withdrawn ones included.

create or replace function public.append_founder_note(p_meeting_id uuid, p_note jsonb, p_max integer)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update public.board_meetings
       set founder_notes = founder_notes || jsonb_build_array(p_note), founder_typing_until = null
     where id = p_meeting_id
       and (select count(*) from jsonb_array_elements(founder_notes) n
             where not (n ? 'withdrawn_at') and not coalesce((n ->> 'before_meeting')::boolean, false)) < p_max
       and jsonb_array_length(founder_notes) < 20
       and status in ('preparing', 'independent_complete', 'discussing', 'discussion_complete')
    returning 1)
  select exists (select 1 from done);
$$;
revoke all on function public.append_founder_note(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.append_founder_note(uuid, jsonb, integer) to service_role;

create or replace function public.withdraw_founder_note(p_meeting_id uuid, p_note_id text, p_status text, p_claimed_at timestamptz)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update public.board_meetings m
       set founder_notes = (
         select jsonb_agg(case when n ->> 'id' = p_note_id then n || jsonb_build_object('withdrawn_at', now()) else n end order by i)
           from jsonb_array_elements(m.founder_notes) with ordinality as t(n, i))
     where m.id = p_meeting_id
       and m.status = p_status
       and m.step_claimed_at is not distinct from p_claimed_at
       and exists (select 1 from jsonb_array_elements(m.founder_notes) n
                    where n ->> 'id' = p_note_id and not (n ? 'withdrawn_at') and not coalesce((n ->> 'before_meeting')::boolean, false))
       and not exists (select 1 from jsonb_array_elements(coalesce(m.discussion_transcript, '[]'::jsonb)) e where e ->> 'note_id' = p_note_id)
    returning 1)
  select exists (select 1 from done);
$$;
revoke all on function public.withdraw_founder_note(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.withdraw_founder_note(uuid, text, text, timestamptz) to service_role;
