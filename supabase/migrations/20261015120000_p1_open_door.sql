-- Workstream P1: the founder in the room (the open door).
--
-- While a server-run meeting is under way the founder can add a fact, a
-- question to one advisor or a challenge. It goes into the next round, and
-- the advisors answer it as they would each other; the Chair takes it as
-- what the founder said. The founder can also ask for the decision now, or
-- for one more round (at most two). The meeting waits for the founder only
-- while they're typing as a round ends, for up to a minute.
--
-- Everything here is written by the server (meetingRun), never the browser:
-- none of these columns is in the column grants on board_meetings.

alter table public.board_meetings
  -- What the founder said during the meeting, in order:
  -- [{ id, text, to_advisor_id, to_name, at }]. A note is "used" once it
  -- appears in the discussion transcript (by its id).
  add column if not exists founder_notes jsonb not null default '[]'::jsonb,
  -- The founder is typing: the meeting doesn't start its next step before
  -- this. Capped by the server at a minute after the last step finished.
  add column if not exists founder_typing_until timestamptz,
  -- When the last step finished, for that cap.
  add column if not exists step_finished_at timestamptz,
  -- The founder asked for the decision: no more rounds.
  add column if not exists decide_now boolean not null default false,
  -- How many times the founder asked for one more round (at most two).
  add column if not exists extra_rounds integer not null default 0
    check (extra_rounds between 0 and 2),
  -- The round the discussion runs to once the founder has asked for more:
  -- one past what was planned, or one past where an early-settled
  -- discussion stopped. Null means the usual number.
  add column if not exists rounds_target integer,
  -- What Round 1 was given about the company (profile, Knowledge, past
  -- decisions, open commitments), so every later round and the Chair get
  -- the same memory, not just the profile.
  add column if not exists context_package text,
  -- What the whole meeting cost (every model call logged against it), shown
  -- on the results page. Set when the resolution is written.
  add column if not exists cost_usd numeric;

-- The open door is shown to founders only once the owner's weak-idea test
-- has shown the room holds its ground. Until then the page shows it only
-- when asked for in the address (?openDoor=1).
alter table public.system_limits
  add column if not exists founder_in_room boolean not null default false;

-- A row inserted from the browser can never carry these either.
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
  end if;
  return new;
end;
$$;

-- Adds one note in a single step, so two notes sent close together can't
-- overwrite each other, and never more than p_max. Server only.
create or replace function public.append_founder_note(p_meeting_id uuid, p_note jsonb, p_max integer)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  with done as (
    update public.board_meetings
       set founder_notes = founder_notes || jsonb_build_array(p_note), founder_typing_until = null
     where id = p_meeting_id and jsonb_array_length(founder_notes) < p_max
       and status in ('preparing', 'independent_complete', 'discussing', 'discussion_complete')
    returning 1)
  select exists (select 1 from done);
$$;
revoke all on function public.append_founder_note(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.append_founder_note(uuid, jsonb, integer) to service_role;
