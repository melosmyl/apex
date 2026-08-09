-- Phase 4.2 — real public sharing. Off by default: sharing is enabled by
-- setting share_token to a random value, revoked by setting it back to
-- null. A revoked token simply stops matching any row — the same "not
-- found" path as a token that never existed, by construction, not by
-- special-casing in application code.
alter table public.documents
  add column if not exists share_token uuid unique;

alter table public.board_meetings
  add column if not exists share_token uuid unique;

-- Rate limiting for the public, unauthenticated endpoints that look up a
-- share_token (and, later, Phase 4.1's free-meeting endpoint — same
-- protection, same table). Service-role only; no client ever reads or
-- writes this directly, so RLS is enabled with no policies at all.
create table if not exists public.public_access_log (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_access_log_lookup_idx
  on public.public_access_log (ip_address, endpoint, created_at);

alter table public.public_access_log enable row level security;
