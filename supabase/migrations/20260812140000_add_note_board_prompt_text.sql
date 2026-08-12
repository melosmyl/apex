-- Phase B: classifyNote's board_prompt_text (the invitation shown on a
-- strategic-sized note — "That sounds bigger than a note — want to put it
-- to the board?") needs to persist between the fire-and-forget enrichment
-- call and the founder actually seeing it, rather than being recomputed.
alter table public.notes
  add column if not exists board_prompt_text text;
