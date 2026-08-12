-- Instrumentation for the cannibalization signal (board meetings/user/week
-- vs assistant messages/user/week), built in from day one per the product
-- owner's explicit requirement — not bolted on after the feature ships.
--
-- Deliberately separate from ai_usage_logs: that table answers "what did
-- the LLM calls cost" (including invisible background tagging/classification
-- the founder never perceives); this answers "what did the founder actually
-- see or do." Conflating them would make the cannibalization signal noisy
-- and wrong from the start.
--
-- Write-only from the client's perspective: authenticated users may insert
-- their own events (note_captured fires straight from the client alongside
-- the plain Note.create() insert — routing it through an edge function just
-- to log an analytics event would add a round trip to the one interaction
-- that must stay fast). No select/update/delete policy exists for anyone —
-- founders never read this table directly; only the service role (which
-- bypasses RLS entirely) reads it, via adminApi in Phase F.
create table public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  company_id uuid references public.companies(id),
  event_type text not null check (event_type in (
    'note_captured',
    'interjection_shown',
    'routing_prompt_shown',
    'routing_accepted',
    'accountability_chase_shown',
    'welcome_back_shown'
  )),
  note_id uuid references public.notes(id),
  task_id uuid references public.tasks(id),
  meeting_id uuid references public.board_meetings(id),
  created_at timestamptz not null default now()
);

alter table public.assistant_events enable row level security;

create policy "assistant_events_self_insert"
  on public.assistant_events for insert to authenticated
  with check (user_id = auth.uid());

-- Same reasoning as anonymous_users_no_notes — this feature isn't part of
-- the anonymous free-meeting flow, and anonymous sessions run as the
-- `authenticated` role, so the plain policy above would otherwise cover them.
create policy "anonymous_users_no_assistant_events"
  on public.assistant_events as restrictive for insert to public
  with check (not public.is_anonymous_user());

create index assistant_events_user_id_created_at_idx on public.assistant_events (user_id, created_at);
