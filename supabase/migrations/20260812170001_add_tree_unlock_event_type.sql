-- Progression Tree Phase E — the "tree_unlock" interjection ("you're one
-- step from X") needs its own event_type, same precedent as
-- accountability_chase_shown/welcome_back_shown getting specific values
-- rather than the generic interjection_shown. progression_node_id lets the
-- shown-once tracking (in getSessionInterjection) and the admin
-- cannibalization panel both know which node a shown event was about.
--
-- Guarded (2026-10-14): progression_nodes is created a day later, in
-- 20260813100100, so on a fresh database this column is added by
-- 20260813100101_add_progression_node_to_assistant_events instead.
-- Production already ran this file with the table in place.
do $$
begin
  if to_regclass('public.progression_nodes') is not null then
    alter table public.assistant_events
      add column if not exists progression_node_id uuid references public.progression_nodes(id);
  end if;
end $$;

alter table public.assistant_events drop constraint assistant_events_event_type_check;
alter table public.assistant_events add constraint assistant_events_event_type_check
  check (event_type in (
    'note_captured',
    'interjection_shown',
    'routing_prompt_shown',
    'routing_accepted',
    'accountability_chase_shown',
    'welcome_back_shown',
    'tree_unlock_shown'
  ));
