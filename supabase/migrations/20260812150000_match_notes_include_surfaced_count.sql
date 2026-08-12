-- checkNoteRelevance needs surfaced_count on the match result to increment
-- it without a second round trip. Postgres won't let `create or replace`
-- change a function's return row shape, so the old signature has to be
-- dropped first.
drop function if exists public.match_notes(uuid, extensions.vector, integer, double precision);

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
  surfaced_count integer,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    n.id, n.raw_text, n.category, n.tags, n.surfaced_count, n.created_at,
    1 - (n.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.notes n
  where n.company_id = p_company_id
    and n.embedding is not null
    and n.status not in ('routed', 'dismissed', 'archived')
    and 1 - (n.embedding operator(extensions.<=>) p_query_embedding) >= p_min_similarity
  order by n.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count
$$;
