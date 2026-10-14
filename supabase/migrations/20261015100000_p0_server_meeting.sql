-- Workstream P0: the server runs the meeting.
--
-- Until now the browser called each step in turn (Round 1, the discussion,
-- the resolution), so a closed tab or a locked phone stopped a meeting
-- halfway. A meeting started with driver 'server' moves on by itself: each
-- step runs after its request has answered, starts the next when it ends,
-- and a once-a-minute sweep restarts a step that stalled. Meetings started
-- by an older page keep driver 'browser' and run exactly as before.

alter table public.board_meetings
  add column if not exists driver text not null default 'browser'
    check (driver in ('browser', 'server')),
  -- When the step now running was taken, and how many times this step has
  -- been tried (reset when a step finishes). Null between steps.
  add column if not exists step_claimed_at timestamptz,
  add column if not exists step_attempts integer not null default 0,
  -- Human advisors are seated: after Round 1 the meeting waits for the
  -- founder to type their views (or skip) before the discussion starts.
  add column if not exists awaiting_human_input boolean not null default false,
  -- Advisors whose Round 1 recommendations were near-identical, worked out
  -- once before Round 2 and used by every later round.
  add column if not exists convergence_candidates jsonb,
  -- Why a server-run meeting stopped, in plain words for the founder.
  add column if not exists failure_reason text,
  -- How many times the sweep has had to pick this meeting up since its last
  -- step finished. A meeting that keeps needing it is given up on.
  add column if not exists sweep_count integer not null default 0;

-- The sweep's lookup: only server-run meetings that are still under way.
create index if not exists board_meetings_server_active_idx
  on public.board_meetings (status, updated_at)
  where driver = 'server' and status in ('preparing', 'independent_complete', 'discussing', 'discussion_complete', 'synthesizing');

-- None of these columns is browser-writable: the column grants on
-- board_meetings (security checkpoint part C) name only the fields the page
-- edits, and new columns aren't among them. A row inserted from the browser
-- is never a server-run meeting either: the insert guard (part E) now also
-- resets these, so the sweep can't be made to run a meeting that skipped
-- startBoardMeeting's checks.
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
  end if;
  return new;
end;
$$;

-- Every minute: move on any server-run meeting nobody moved on, and restart
-- a stalled step. Same pattern as task-runs-sweep. The function is called
-- only when such a meeting exists; the thresholds match meetingRun's sweep.
select cron.schedule(
  'meeting-run-sweep',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://bqqcobaspbkyofupmhfe.supabase.co/functions/v1/meetingRun',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"action":"sweep"}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (
    select 1 from public.board_meetings
    where driver = 'server' and created_at > now() - interval '1 day'
      and (
        (status = 'preparing' and step_claimed_at < now() - interval '4 minutes')
        or (status = 'independent_complete' and not awaiting_human_input and updated_at < now() - interval '30 seconds')
        or (status = 'discussing' and step_claimed_at is null and updated_at < now() - interval '30 seconds')
        or (status = 'discussing' and step_claimed_at < now() - interval '4 minutes')
        or (status = 'discussion_complete' and updated_at < now() - interval '30 seconds')
        or (status = 'synthesizing' and updated_at < now() - interval '4 minutes')
      )
  );
  $$
);
