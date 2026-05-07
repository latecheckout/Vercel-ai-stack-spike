-- Curated LCA content. Seeded by `pnpm db:seed-knowledge`, which scrapes
-- public pages of latecheckout.agency and writes via the service role.
-- The agent retrieves rows through the `search_lca_knowledge(q, k)` SQL
-- function below — Postgres full-text search with weighted ranking.
create table public.lca_knowledge (
  id            uuid        primary key default gen_random_uuid(),
  title         text        not null,
  content       text        not null,
  category      text        not null,
  tags          text[]      not null default '{}',
  source_url    text        unique,
  search_vector tsvector,
  created_at    timestamptz not null default now()
);

comment on table public.lca_knowledge is 'Curated LCA content; service-role writes only. Seeded from latecheckout.agency.';

create index lca_knowledge_category_idx on public.lca_knowledge (category);
create index lca_knowledge_search_idx on public.lca_knowledge using gin (search_vector);

-- `search_vector` is maintained by a trigger because the text-search
-- functions are STABLE (not IMMUTABLE), which Postgres rejects in a
-- generated column. The trigger fires on insert and on changes to
-- title/content/tags.
create or replace function public.lca_knowledge_refresh_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.tags, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.content, '')), 'B');
  return new;
end;
$$;

create trigger lca_knowledge_search_vector_sync
  before insert or update of title, content, tags
  on public.lca_knowledge
  for each row
  execute function public.lca_knowledge_refresh_search_vector();

alter table public.lca_knowledge enable row level security;

-- Read-only for clients; only service_role may mutate.
create policy "anyone can read lca_knowledge"
  on public.lca_knowledge
  for select
  to anon, authenticated
  using (true);

create policy "service can insert lca_knowledge"
  on public.lca_knowledge
  for insert
  to service_role
  with check (true);

create policy "service can update lca_knowledge"
  on public.lca_knowledge
  for update
  to service_role
  using (true)
  with check (true);

create policy "service can delete lca_knowledge"
  on public.lca_knowledge
  for delete
  to service_role
  using (true);

-- Ranked full-text search.
--
-- The agent passes natural-language queries ("Tell me about the Grammarly
-- project"). We deliberately use OR semantics so a single off-vocab word
-- doesn't zero out the result set — `plainto_tsquery` ANDs every term, so
-- one term that doesn't appear in any case-study page filters everything
-- out. Instead we parse with plainto_tsquery, swap the `&` operators for
-- `|`, and rank with `ts_rank` (which rewards docs that match more of the
-- query terms with higher weight). Title + tags are setweight 'A' so a
-- specific keyword still pushes the right case-study row to the top.
create or replace function public.search_lca_knowledge(q text, max_results int default 3)
returns table (
  id         uuid,
  title      text,
  content    text,
  category   text,
  tags       text[],
  source_url text,
  rank       real
)
language sql
stable
security invoker
set search_path = public
as $$
  with parsed as (
    select
      nullif(
        regexp_replace(plainto_tsquery('english', q)::text, ' & ', ' | ', 'g'),
        ''
      )::tsquery as tsq
  )
  select
    lk.id,
    lk.title,
    lk.content,
    lk.category,
    lk.tags,
    lk.source_url,
    ts_rank(lk.search_vector, p.tsq) as rank
  from public.lca_knowledge lk, parsed p
  where p.tsq is not null
    and lk.search_vector @@ p.tsq
  order by rank desc
  limit greatest(max_results, 1)
$$;

comment on function public.search_lca_knowledge(text, int) is
  'Full-text search over lca_knowledge. Ranked with ts_rank_cd, query parsed via websearch_to_tsquery.';
