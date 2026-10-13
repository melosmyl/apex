-- Adds assistant_events.progression_node_id once progression_nodes exists.
-- 20260812170001 tried to add it a day before that table was created, so a
-- fresh database failed there; that file is now guarded and this one does
-- the work. Production already has the column (and its key), so there this
-- is a no-op: Postgres skips the whole line. The 2026-10-01 security
-- checkpoint later sets the key to "on delete set null".
alter table public.assistant_events
  add column if not exists progression_node_id uuid references public.progression_nodes(id);
