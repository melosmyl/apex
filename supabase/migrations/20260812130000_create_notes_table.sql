-- The Assistant, Phase A: freeform capture. No entity like this existed —
-- closest precedent is `pins`, but that always references existing content
-- (source_type/source_id required); this is genuinely freeform. Column set
-- and RLS shape mirror `pins` deliberately (owner-scoped read/update/delete,
-- created_by_id default auth.uid()), since that's this app's established
-- convention for a founder-owned, company-scoped entity.
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users(id),
  company_id uuid not null references public.companies(id),
  raw_text text not null,
  status text not null default 'active' check (status in ('active', 'resurfaced', 'routed', 'dismissed', 'archived')),
  category text,
  subcategory text,
  tags jsonb default '[]'::jsonb,
  importance text default 'normal' check (importance in ('normal', 'important', 'critical')),
  signal_size text check (signal_size in ('note', 'strategic')),
  classification_confidence numeric,
  routed_meeting_id uuid references public.board_meetings(id),
  surfaced_count integer not null default 0,
  last_surfaced_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

create policy "notes_owner_insert"
  on public.notes for insert to public
  with check (created_by_id = auth.uid());

create policy "notes_owner_or_admin_select"
  on public.notes for select to public
  using (created_by_id = auth.uid() or public.is_admin());

create policy "notes_owner_or_admin_update"
  on public.notes for update to public
  using (created_by_id = auth.uid() or public.is_admin());

create policy "notes_owner_or_admin_delete"
  on public.notes for delete to public
  using (created_by_id = auth.uid() or public.is_admin());

-- The Assistant is a returning-founder feature, not part of the anonymous
-- free-meeting flow — same treatment as pins/decisions/tasks/documents.
create policy "anonymous_users_no_notes"
  on public.notes as restrictive for insert to public
  with check (not public.is_anonymous_user());

create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create index notes_company_id_idx on public.notes (company_id);
create index notes_created_by_id_idx on public.notes (created_by_id);
