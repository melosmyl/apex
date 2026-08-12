-- Resurfacing reuses the exact retrieval mechanism board memory already
-- uses (match_decisions) — same column shape, same HNSW choice, same
-- function signature — pointed at notes instead of decisions. Deliberately
-- not a second retrieval system.
alter table public.notes
  add column if not exists embedding extensions.vector(1536);

create index if not exists notes_embedding_idx
  on public.notes using hnsw (embedding extensions.vector_cosine_ops);

-- Higher similarity floor than match_decisions' 0.15: a wrong interjection
-- shown to a founder costs more than an irrelevant decision silently
-- included in an advisor's context. Also excludes notes that are no longer
-- "live" (already routed to a meeting, or dismissed/archived) — resurfacing
-- a note that's already been acted on isn't a relevant interjection.
create or replace function public.match_notes(
  p_company_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 5,
  p_min_similarity float default 0.3
)
returns table (
  id uuid,
  raw_text text,
  category text,
  tags jsonb,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    n.id, n.raw_text, n.category, n.tags, n.created_at,
    1 - (n.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.notes n
  where n.company_id = p_company_id
    and n.embedding is not null
    and n.status not in ('routed', 'dismissed', 'archived')
    and 1 - (n.embedding operator(extensions.<=>) p_query_embedding) >= p_min_similarity
  order by n.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count
$$;
