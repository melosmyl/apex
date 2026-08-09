-- Relevance-based board memory: advisors should recall the decision most
-- related to the question being asked, not merely the most recent one.
create extension if not exists vector with schema extensions;

-- 1536 dimensions matches OpenAI text-embedding-3-small.
alter table public.decisions
  add column if not exists embedding extensions.vector(1536);

-- HNSW rather than IVFFlat: it needs no training data, which matters while the
-- decision corpus is still small.
create index if not exists decisions_embedding_idx
  on public.decisions using hnsw (embedding extensions.vector_cosine_ops);

-- Ordering by the <=> operator cannot be expressed through PostgREST, so
-- similarity search is exposed as a function instead.
create or replace function public.match_decisions(
  p_company_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 5,
  p_min_similarity float default 0.15
)
returns table (
  id uuid,
  question text,
  final_recommendation text,
  summary text,
  decision_taken text,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    d.id, d.question, d.final_recommendation, d.summary, d.decision_taken, d.created_at,
    1 - (d.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.decisions d
  where d.company_id = p_company_id
    and d.embedding is not null
    and 1 - (d.embedding operator(extensions.<=>) p_query_embedding) >= p_min_similarity
  order by d.embedding operator(extensions.<=>) p_query_embedding
  limit p_match_count
$$;
