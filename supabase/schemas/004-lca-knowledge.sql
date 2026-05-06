-- Curated LCA content. The spike retrieves from the in-repo TypeScript
-- knowledge module, but the table is here to mirror the production shape.
-- `embedding` is for production pgvector search (seeded but not queried in spike).
create table public.lca_knowledge (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  content     text        not null,
  category    text        not null check (category in ('service', 'case-study', 'approach', 'engagement', 'faq')),
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);

comment on table public.lca_knowledge is 'Curated LCA content; service-role writes only.';

create index lca_knowledge_category_idx on public.lca_knowledge (category);
-- pgvector index (IVFFlat) — uncomment when enabling semantic search:
-- create index lca_knowledge_embedding_idx on public.lca_knowledge
--   using ivfflat (embedding vector_cosine_ops) with (lists = 10);

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
