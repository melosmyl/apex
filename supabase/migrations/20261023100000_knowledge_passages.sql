-- Knowledge, read by what matters (owner, 23 October 2026, Stage 1).
--
-- The board used to read the first few hundred characters of the newest
-- Knowledge items, so most of a long business plan never reached it. Now
-- every Knowledge item is split into passages, each with a meaning
-- fingerprint (an embedding, as past decisions already have), and meetings
-- and "Do this for me" tasks read the passages that bear on their question.
--
--   - An item whose words change is marked as needing its passages again
--     (passages_indexed_at goes back to empty). Meetings and tasks index what
--     is marked before they read, so nothing is ever read stale.
--   - Every passage carries a fingerprint of the exact words it was made
--     from (knowledge_hash), and only passages of the item's current words
--     are ever read: two readers indexing at once, or an edit landing midway,
--     can't leave old passages behind.
--   - An item that keeps failing to index is left alone after three tries
--     (until it's edited) and read by its opening, as before.
--   - Marking an item indexed isn't an edit: its "last updated" time stays.
--   - Passages go with their item, and with their company.
--   - Nobody reads passages directly; the server reads them through
--     match_knowledge_passages, for the founder's own items only.

set lock_timeout = '5s';

alter table public.documents
  add column passages_indexed_at timestamptz,
  add column passages_hash text,
  add column passages_attempts smallint not null default 0;

-- The fingerprint of what a passage was made from: the item's company,
-- title and text.
create function public.knowledge_hash(p_company_id uuid, p_title text, p_content text)
returns text
language sql immutable set search_path = ''
as $$
  select md5(coalesce(p_company_id::text, '') || chr(31) || coalesce(p_title, '') || chr(31) || coalesce(p_content, ''));
$$;

create table public.knowledge_passages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  content_hash text not null,
  passage_index integer not null check (passage_index >= 0),
  text text not null check (char_length(text) between 1 and 4000),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, content_hash, passage_index)
);
-- Matching is exact, within one company (a company's passages are few), so
-- no approximate vector index: one could miss a founder's own passages.
create index knowledge_passages_company on public.knowledge_passages (company_id);
alter table public.knowledge_passages enable row level security;
revoke all on public.knowledge_passages from anon, authenticated;

-- New words, new passages: an item whose title, text, kind or company
-- changes needs indexing again, with three fresh tries.
create function public.mark_knowledge_for_indexing()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.title is distinct from old.title or new.content is distinct from old.content
                           or new.kind is distinct from old.kind or new.company_id is distinct from old.company_id) then
    new.passages_indexed_at := null;
    new.passages_attempts := 0;
  end if;
  return new;
end;
$$;
create trigger mark_knowledge_for_indexing before update on public.documents
  for each row execute function public.mark_knowledge_for_indexing();

-- A document's "last updated" time moves only when something other than its
-- indexing changes. (Documents used the shared set_updated_at, which stamps
-- every update.)
create function public.set_document_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  indexing constant text[] := array['updated_at', 'passages_indexed_at', 'passages_hash', 'passages_attempts'];
begin
  if (to_jsonb(new) - indexing) is distinct from (to_jsonb(old) - indexing) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
drop trigger set_updated_at on public.documents;
create trigger set_updated_at before update on public.documents
  for each row execute function public.set_document_updated_at();

-- The Knowledge items waiting for passages, newest first: live ones, not
-- "What you told the board" (always given in full), not given up on.
-- p_owner_id null: everyone's in the company.
create function public.knowledge_to_index(p_company_id uuid, p_owner_id uuid, p_limit int default 25)
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
     and coalesce(d.category, '') <> 'What you told the board'
   order by d.created_at desc
   limit greatest(1, least(p_limit, 100))
$$;

-- An item's passages are done: if its words are still the ones they were
-- made from (p_hash) and all p_count of them are stored, it's marked
-- indexed. Either way, passages of any other words go (older words, or a
-- slower reader's), as do any past p_count (from a different way of
-- splitting). The item is locked meanwhile, so two finishing at once
-- can't cross.
create function public.finish_knowledge_passages(p_document_id uuid, p_hash text, p_count int)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  current_hash text;
begin
  select public.knowledge_hash(d.company_id, d.title, d.content) into current_hash
    from public.documents d where d.id = p_document_id for update;
  if not found then return false; end if;
  delete from public.knowledge_passages
   where document_id = p_document_id and (content_hash <> current_hash or passage_index >= p_count);
  if p_hash is distinct from current_hash
     or (select count(*) from public.knowledge_passages where document_id = p_document_id and content_hash = p_hash) <> p_count then
    return false;
  end if;
  update public.documents set passages_indexed_at = now(), passages_hash = p_hash, passages_attempts = 0
   where id = p_document_id;
  return true;
end;
$$;

-- An item couldn't be indexed: one try used, if its words haven't changed.
create function public.knowledge_passages_failed(p_document_id uuid, p_hash text)
returns void
language sql security definer set search_path = ''
as $$
  update public.documents set passages_attempts = passages_attempts + 1
   where id = p_document_id and public.knowledge_hash(company_id, title, content) = p_hash;
$$;

-- The passages that bear on a question, from the founder's own Knowledge in
-- one company (p_owner_id; null for the whole company's, as "Do this for me"
-- tasks have always read it), closest first, at most p_per_item from any one
-- item. "What you told the board" isn't included: it is always given in
-- full. p_founder_only leaves out the board's accepted work (its Draft,
-- Plan, Research and Calculation categories, as tasks have always left it
-- out), so an advisor doesn't work from the board's own drafts.
create function public.match_knowledge_passages(
  p_company_id uuid,
  p_owner_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count int default 40,
  p_min_similarity float default 0.15,
  p_founder_only boolean default false,
  p_per_item int default 3
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
       and coalesce(d.category, '') <> 'What you told the board'
       and d.passages_indexed_at is not null
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

revoke all on function public.mark_knowledge_for_indexing(), public.set_document_updated_at(), public.knowledge_hash(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.knowledge_to_index(uuid, uuid, int), public.finish_knowledge_passages(uuid, text, int),
  public.knowledge_passages_failed(uuid, text), public.match_knowledge_passages(uuid, uuid, extensions.vector, int, float, boolean, int)
  from public, anon, authenticated;
grant execute on function public.knowledge_to_index(uuid, uuid, int), public.finish_knowledge_passages(uuid, text, int),
  public.knowledge_passages_failed(uuid, text), public.match_knowledge_passages(uuid, uuid, extensions.vector, int, float, boolean, int)
  to service_role;

reset lock_timeout;
