-- What the founder told the board, never lost (owner, 23 October 2026).
--
-- The newest five "What you told the board" entries are given in full to
-- every meeting and task. Older ones were never read at all; now they're
-- split into passages like the rest of Knowledge, so one from months ago
-- reaches a meeting or task when the question bears on it. The five given
-- whole are left out of the matching (p_exclude), so nothing is given
-- twice.

-- Indexing now includes them, after the rest of Knowledge (the newest are
-- given in full anyway).
create or replace function public.knowledge_to_index(p_company_id uuid, p_owner_id uuid, p_limit int default 25)
returns table (id uuid, title text, content text, content_hash text)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.title, d.content, public.knowledge_hash(d.company_id, d.title, d.content)
    from public.documents d
   where d.company_id = p_company_id
     and (p_owner_id is null or d.created_by_id = p_owner_id)
     and d.kind = 'knowledge'
     and d.passages_indexed_at is null
     and d.passages_attempts < 3
     and coalesce(d.status, '') not in ('archived', 'superseded')
   order by (coalesce(d.category, '') = 'What you told the board'), d.created_at desc
   limit greatest(1, least(p_limit, 100))
$$;

-- Matching includes them too, except the items in p_exclude (given in full).
drop function public.match_knowledge_passages(uuid, uuid, extensions.vector, int, float, boolean, int);
create function public.match_knowledge_passages(
  p_company_id uuid,
  p_owner_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 40,
  p_min_similarity float default 0.15,
  p_founder_only boolean default false,
  p_per_item int default 3,
  p_exclude uuid[] default '{}'
)
returns table (
  document_id uuid, passage_index int, text text, similarity float,
  title text, category text, created_at timestamptz, board_work boolean
)
language sql stable security definer set search_path = ''
as $$
  with mine as materialized (
    select p.document_id, p.passage_index, p.text,
           1 - (p.embedding operator(extensions.<=>) p_query_embedding) as similarity,
           d.title, d.category, d.created_at,
           (d.created_by_advisor_id is not null or d.task_id is not null) as board_work
      from public.knowledge_passages p
      join public.documents d on d.id = p.document_id
     where p.company_id = p_company_id
       and d.company_id = p_company_id
       and p.content_hash = d.passages_hash
       and (p_owner_id is null or d.created_by_id = p_owner_id)
       and d.kind = 'knowledge'
       and coalesce(d.status, '') not in ('archived', 'superseded')
       and d.passages_indexed_at is not null
       and not coalesce(d.id = any(p_exclude), false)
       and (not p_founder_only or coalesce(d.category, '') not in ('Draft', 'Plan', 'Research', 'Calculation'))
  ), ranked as (
    select m.*, row_number() over (partition by m.document_id order by m.similarity desc) as n
      from mine m
     where m.similarity >= p_min_similarity
  )
  select r.document_id, r.passage_index, r.text, r.similarity, r.title, r.category, r.created_at, r.board_work
    from ranked r
   where r.n <= greatest(1, p_per_item)
   order by r.similarity desc
   limit greatest(1, least(p_match_count, 100))
$$;

revoke all on function public.match_knowledge_passages(uuid, uuid, extensions.vector, int, float, boolean, int, uuid[])
  from public, anon, authenticated;
grant execute on function public.match_knowledge_passages(uuid, uuid, extensions.vector, int, float, boolean, int, uuid[])
  to service_role;
