-- The Progression Tree — Phase A. Three tables: the generated tree
-- (progression_trees, one per company), its nodes (progression_nodes,
-- deliberately flat — this is the table the "never one large nested
-- structure" constraint protects), and completion records
-- (progression_node_completions, a SEPARATE table from a boolean column on
-- nodes so that "never resets" is structural: db_fact completions are
-- idempotently upserted, never deleted on absence, so no code path can ever
-- un-complete a node).
--
-- All three are generated/written server-side only (tree generation,
-- completion derivation, and the Assistant-asked answer path all run as
-- the service role) — founders read their own tree directly client-side,
-- same as `notes`, but never write to these tables themselves.

create table public.progression_trees (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id),
  company_id uuid not null references public.companies(id),
  spine_version text not null,
  generated_at timestamptz not null default now(),
  generation_status text not null default 'complete' check (generation_status in ('pending', 'complete', 'failed')),
  jurisdiction_supported boolean not null default true,
  -- The demand signal for "prioritise my country" (owner's decision,
  -- 2026-08-13) — set once the founder clicks the prompt shown on an
  -- unsupported-jurisdiction tree. Null until clicked; never reset.
  jurisdiction_request_clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create table public.progression_nodes (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id),
  company_id uuid not null references public.companies(id),
  tree_id uuid not null references public.progression_trees(id),
  source text not null check (source in ('spine', 'branch')),
  spine_key text,
  order_index integer not null,
  label text not null,
  unlock_description text not null,
  official_source_url text,
  official_source_name text,
  -- Never LLM-authored — assigned server-side from a closed vocabulary, so
  -- whether a node claims to be "done" is never left to free-text generation.
  derivation_type text not null check (derivation_type in ('db_fact', 'assistant_asked')),
  derivation_rule jsonb,
  created_at timestamptz not null default now()
);

create table public.progression_node_completions (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null references auth.users(id),
  company_id uuid not null references public.companies(id),
  node_id uuid not null references public.progression_nodes(id),
  completed_at timestamptz not null default now(),
  completion_source text not null check (completion_source in ('db_fact', 'assistant_answer')),
  assistant_answer_text text,
  unique (node_id)
);

alter table public.progression_trees enable row level security;
alter table public.progression_nodes enable row level security;
alter table public.progression_node_completions enable row level security;

-- Read-only for founders (owner-or-admin, same shape as notes/pins) — no
-- insert/update/delete policy for the authenticated role on any of the
-- three: every write goes through a service-role edge function.
create policy "progression_trees_owner_or_admin_select"
  on public.progression_trees for select to public
  using (created_by_id = auth.uid() or public.is_admin());

create policy "progression_nodes_owner_or_admin_select"
  on public.progression_nodes for select to public
  using (created_by_id = auth.uid() or public.is_admin());

create policy "progression_node_completions_owner_or_admin_select"
  on public.progression_node_completions for select to public
  using (created_by_id = auth.uid() or public.is_admin());

create trigger set_updated_at before update on public.progression_trees
  for each row execute function public.set_updated_at();

create index progression_trees_company_id_idx on public.progression_trees (company_id);
create index progression_nodes_company_id_idx on public.progression_nodes (company_id);
create index progression_nodes_tree_id_idx on public.progression_nodes (tree_id);
create index progression_node_completions_company_id_idx on public.progression_node_completions (company_id);
create index progression_node_completions_node_id_idx on public.progression_node_completions (node_id);
