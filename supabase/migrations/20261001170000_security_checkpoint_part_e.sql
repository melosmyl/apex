-- Security checkpoint, Part E: fixes from the independent second check.
--
-- The second-check reviewers found that the paid meeting steps after
-- startBoardMeeting trusted things the browser could still write, that the
-- new "runs once" guards and anonymous caps could be raced with parallel
-- requests, and that the free-meeting claim wasn't atomic. This closes them.

set lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- 1. Meeting states the server moves through.
--    discussing / synthesizing: a step has claimed the meeting (so a second
--    parallel request is refused). superseded: a free-meeting retry replaced
--    this meeting; no paid step accepts it.
-- ---------------------------------------------------------------------
alter table public.board_meetings drop constraint if exists board_meetings_status_check;
alter table public.board_meetings add constraint board_meetings_status_check check (status in
  ('preparing','independent_complete','discussing','discussion_complete','challenge_complete',
   'synthesizing','complete','failed','superseded'));

-- Which advisors the server chose for this meeting. The paid rounds call only
-- these, never whatever ids sit in the browser-editable independent_responses.
alter table public.board_meetings add column if not exists participant_advisor_ids uuid[];

-- ---------------------------------------------------------------------
-- 2. A meeting row created from the browser can't skip the paid-step gates.
--    Without this, a client could insert a row already marked
--    independent_complete, with any advisors in independent_responses, and
--    run the discussion and resolution without startBoardMeeting's checks
--    (free-meeting attempt, daily ceiling, per-user limits).
-- ---------------------------------------------------------------------
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
  end if;
  return new;
end;
$$;
drop trigger if exists guard_client_meeting_insert on public.board_meetings;
create trigger guard_client_meeting_insert before insert on public.board_meetings
  for each row execute function public.guard_client_meeting_insert();

-- ---------------------------------------------------------------------
-- 3. Anonymous caps hold under parallel requests too: each check takes a
--    per-user, per-table lock first, so concurrent inserts are counted one
--    after another. A superseded meeting no longer counts as live.
-- ---------------------------------------------------------------------
create or replace function public.enforce_anonymous_caps() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cap integer := TG_ARGV[0]::integer;
  extra_filter text := coalesce(TG_ARGV[1], 'true');
  uid uuid;
  over_cap boolean;
begin
  for uid in select distinct n.created_by_id from new_rows n join auth.users u on u.id = n.created_by_id and u.is_anonymous loop
    perform pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || uid::text, 0));
    execute format('select (select count(*) from public.%I t where t.created_by_id = $1 and (%s)) > %s',
                   TG_TABLE_NAME, extra_filter, cap)
      into over_cap using uid;
    if over_cap then
      raise exception 'Free-meeting limit reached for %', TG_TABLE_NAME using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.enforce_anonymous_caps() from public, anon, authenticated;

drop trigger if exists anonymous_cap_meetings_live on public.board_meetings;
create trigger anonymous_cap_meetings_live after insert on public.board_meetings
  referencing new table as new_rows for each statement
  execute function public.enforce_anonymous_caps('1', 't.status not in (''failed'', ''superseded'')');

-- ---------------------------------------------------------------------
-- 4. Free-meeting spend, tagged when it happens: every model call made for
--    an anonymous session is logged with anonymous = true (routeAdvisorRequest
--    records what its caller tells it; only the server calls it). Today's
--    free spend is the sum of those rows, plus a reserve for each meeting
--    claimed in the last 30 minutes that hasn't yet logged that much itself.
--    A visitor who later signs up keeps their earlier rows counted.
-- ---------------------------------------------------------------------
alter table public.ai_usage_logs add column if not exists anonymous boolean not null default false;
comment on column public.ai_usage_logs.anonymous is
  'The call was made for an anonymous (free-meeting) session. free_meeting_spend_today sums these.';

create or replace function public.free_meeting_spend_today() returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  with spent as (
    select coalesce(sum(estimated_cost), 0) as amount
    from public.ai_usage_logs
    where anonymous and created_at >= date_trunc('day', now())
  ),
  in_flight as (
    select coalesce(sum(greatest(0, 0.75 - coalesce((
      select sum(l.estimated_cost) from public.ai_usage_logs l
      where l.user_id = a.user_id and l.anonymous and l.created_at >= a.claimed_at
    ), 0))), 0) as amount
    from public.free_meeting_attempts a
    where a.claimed_at >= now() - interval '30 minutes'
  )
  select spent.amount + in_flight.amount from spent, in_flight;
$$;
revoke execute on function public.free_meeting_spend_today() from public, anon, authenticated;
grant execute on function public.free_meeting_spend_today() to service_role;

-- ---------------------------------------------------------------------
-- 5. Claiming a free meeting is one atomic step. Under one lock: the attempt
--    belongs to this session and is still open, the session hasn't finished a
--    meeting, its network is under today's per-IP limit, and today's spend is
--    under the ceiling. A retry supersedes the session's unfinished meetings.
--    Returns 'ok' or the reason it was refused.
-- ---------------------------------------------------------------------
create or replace function public.claim_free_meeting(p_attempt_id uuid, p_user_id uuid, p_ceiling numeric, p_ip_limit integer)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.free_meeting_attempts%rowtype;
  ip_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('claim_free_meeting', 0));

  select * into a from public.free_meeting_attempts
  where id = p_attempt_id and user_id = p_user_id and blocked_reason is null and not completed
    and started_at >= now() - interval '24 hours'
  for update;
  if not found then return 'expired'; end if;

  if exists (select 1 from public.board_meetings where created_by_id = p_user_id and status = 'complete') then
    return 'already_used';
  end if;
  -- A meeting mid-discussion or mid-resolution isn't superseded under it.
  -- (A step that died more than 10 minutes ago — the functions' own stale
  -- window — no longer blocks a retry; it's superseded below.)
  if exists (select 1 from public.board_meetings where created_by_id = p_user_id
             and status in ('discussing', 'synthesizing') and updated_at > now() - interval '10 minutes') then
    return 'busy';
  end if;

  if a.claimed_at is null then
    select count(*) into ip_used from public.free_meeting_attempts
    where ip_hash = a.ip_hash and claimed_at is not null and started_at >= date_trunc('day', now()) and id <> a.id;
    if ip_used >= p_ip_limit then return 'ip_limit'; end if;
  end if;

  if public.free_meeting_spend_today() >= p_ceiling then return 'ceiling'; end if;

  update public.board_meetings set status = 'superseded'
  where created_by_id = p_user_id and status not in ('complete', 'superseded');
  -- Each claim restarts the in-flight reserve for the meeting it starts.
  update public.free_meeting_attempts set claimed_at = now() where id = a.id;
  return 'ok';
end;
$$;
revoke execute on function public.claim_free_meeting(uuid, uuid, numeric, integer) from public, anon, authenticated;
grant execute on function public.claim_free_meeting(uuid, uuid, numeric, integer) to service_role;

-- ---------------------------------------------------------------------
-- 6. The model registry decides which models founders' advisor rows may ask
--    for by purpose: only 'advisor' rows (and rows with no purpose). Make
--    sure the long-standing defaults are marked, even where their rows
--    already existed before Part B's seed.
-- ---------------------------------------------------------------------
update public.ai_model_configurations
set is_provider_default = true, is_active = true, purpose = coalesce(purpose, 'advisor')
where id in (
    select distinct on (provider) id from public.ai_model_configurations
    where (provider, model_name) in (('openai', 'gpt-4o'), ('anthropic', 'claude-sonnet-5'))
    order by provider, is_active desc, created_at desc
  )
  and not exists (
    select 1 from public.ai_model_configurations d
    where d.provider = ai_model_configurations.provider and d.is_provider_default and d.is_active
      and d.id <> ai_model_configurations.id
  );

-- ---------------------------------------------------------------------
-- 7. Indexes for the new per-user and per-day reads of ai_usage_logs.
-- ---------------------------------------------------------------------
create index if not exists ai_usage_logs_user_created_idx on public.ai_usage_logs (user_id, created_at);
create index if not exists ai_usage_logs_created_idx on public.ai_usage_logs (created_at);

notify pgrst, 'reload schema';
