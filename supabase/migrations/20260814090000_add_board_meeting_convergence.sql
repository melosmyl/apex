-- Advisors converging on near-identical recommendations was previously
-- invisible to the Chair — each independent/discussion response was its own
-- row with no signal that two advisors ended up saying the same thing.
-- runBoardDiscussion now detects this (embedding similarity on round-1
-- recommendations, confirmed or ruled out by whether real differentiation
-- happened during discussion) and persists the result here so
-- runChairSynthesis can present a converged pair once, attributed to both,
-- instead of as two separate findings.
alter table board_meetings
  add column if not exists convergence jsonb not null default '[]'::jsonb;

comment on column board_meetings.convergence is
  'Array of {advisors: [name, name, ...]} groups whose recommendations genuinely converged during this meeting, detected in runBoardDiscussion and consumed by runChairSynthesis.';
