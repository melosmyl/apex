-- Workstream P1, revised: three ways to hold a meeting (owner, 15 October 2026).
--
--   quick   "Ask the board": today's meeting, untouched (the default)
--   sit_in  "Sit in": the same rounds, but the meeting stops after every
--           round and waits for the founder: Carry on, a note, Decide now
--           or One more round. Nothing moves until they do.
--   join    "Join the board": one advisor at a time (P1 Stage 2, not built)
--
-- The typing hold and screen pacing are no longer used; their columns stay.

alter table public.board_meetings
  add column if not exists pace text not null default 'quick'
    check (pace in ('quick', 'sit_in', 'join')),
  -- A Sit in meeting at a stop: no step starts until the founder acts.
  add column if not exists waiting_for_founder boolean not null default false;

-- A meeting the server waits on is never picked up by the sweep, and the
-- cron job doesn't call it for one; asking for the decision always wins over
-- a stop. A Sit in meeting may wait for days, so "recent" now means it moved
-- in the last day rather than was created in it.
select cron.unschedule('meeting-run-sweep')
where exists (select 1 from cron.job where jobname = 'meeting-run-sweep');

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
    where driver = 'server' and updated_at > now() - interval '1 day'
      and (
        (status = 'preparing' and step_claimed_at < now() - interval '4 minutes')
        or (status = 'independent_complete' and not awaiting_human_input and (not waiting_for_founder or decide_now) and updated_at < now() - interval '30 seconds')
        or (status = 'discussing' and step_claimed_at is null and (not waiting_for_founder or decide_now) and updated_at < now() - interval '30 seconds')
        or (status = 'discussing' and step_claimed_at < now() - interval '4 minutes')
        or (status = 'discussion_complete' and (not waiting_for_founder or decide_now) and updated_at < now() - interval '30 seconds')
        or (status = 'synthesizing' and updated_at < now() - interval '4 minutes')
      )
  );
  $$
);

-- A row inserted from the browser is always a quick, page-run meeting.
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
    new.pace := 'quick';
    new.waiting_for_founder := false;
  end if;
  return new;
end;
$$;
