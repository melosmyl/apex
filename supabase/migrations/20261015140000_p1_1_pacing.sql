-- Workstream P1.1: the room keeps pace with the founder.
--
-- Once the founder engages with the open door (clicks into the box or
-- types), the next round waits until their screen has finished playing the
-- last one, for up to 45 seconds. Then a note reacts to the round they have
-- just read, instead of landing a round or two later. A founder who doesn't
-- engage, or leaves the page, sees the meeting run at full speed as before.
-- Server-written only, like the other meeting step columns.

alter table public.board_meetings
  -- The last round the founder's screen has finished playing.
  add column if not exists founder_seen_round integer not null default 0,
  -- The founder is engaged and watching: the page renews this every few
  -- seconds. Once it lapses, the meeting runs at its own pace again.
  add column if not exists founder_watching_until timestamptz;

-- A row inserted from the browser can't carry these either.
create or replace function public.guard_client_meeting_insert() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from 'preparing' and new.status is distinct from 'complete' then
      raise exception 'Meetings are started by the server' using errcode = 'insufficient_privilege';
    end if;
    if char_length(coalesce(new.question, '')) > 4000 then
      raise exception 'The question is too long' using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(new.participants, '[]'::jsonb)) > 12 then
      raise exception 'Too many participants' using errcode = 'check_violation';
    end if;
    new.created_at := now();
    new.independent_responses := '[]'::jsonb;
    new.challenge_responses := '[]'::jsonb;
    new.discussion_transcript := '[]'::jsonb;
    new.participant_advisor_ids := null;
    new.driver := 'browser';
    new.step_claimed_at := null;
    new.step_attempts := 0;
    new.awaiting_human_input := false;
    new.convergence_candidates := null;
    new.failure_reason := null;
    new.sweep_count := 0;
    new.founder_notes := '[]'::jsonb;
    new.founder_typing_until := null;
    new.step_finished_at := null;
    new.decide_now := false;
    new.extra_rounds := 0;
    new.rounds_target := null;
    new.context_package := null;
    new.cost_usd := null;
    new.founder_seen_round := 0;
    new.founder_watching_until := null;
  end if;
  return new;
end;
$$;
