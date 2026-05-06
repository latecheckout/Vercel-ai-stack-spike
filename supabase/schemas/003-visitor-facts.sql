-- Facts the agent has learned about the visitor — shown in the
-- "What LCA knows about you" panel and editable/deletable by the visitor.
create table public.visitor_facts (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions (id) on delete cascade,
  fact        text        not null,
  category    text        not null check (category in ('company', 'role', 'website', 'project', 'other')),
  source      text        not null,
  created_at  timestamptz not null default now()
);

comment on table public.visitor_facts is 'Facts captured about the visitor in this session.';

create index visitor_facts_session_id_idx on public.visitor_facts (session_id, created_at);

alter table public.visitor_facts enable row level security;

create policy "anyone can read visitor_facts"
  on public.visitor_facts
  for select
  to anon, authenticated
  using (true);

create policy "anyone can insert visitor_facts"
  on public.visitor_facts
  for insert
  to anon, authenticated
  with check (true);

create policy "anyone can update visitor_facts"
  on public.visitor_facts
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anyone can delete visitor_facts"
  on public.visitor_facts
  for delete
  to anon, authenticated
  using (true);
