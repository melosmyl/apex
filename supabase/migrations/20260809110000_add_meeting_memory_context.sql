-- Records what past context a meeting actually drew on — which prior decisions
-- were recalled, how they were retrieved, and which open commitments were in
-- front of the advisors — so the founder can see what informed the board
-- rather than taking its reasoning on trust.
alter table public.board_meetings
  add column if not exists memory_context jsonb;
