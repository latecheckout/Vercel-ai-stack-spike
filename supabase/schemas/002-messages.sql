-- Full conversation history per session — used for replay / inspection.
create table public.messages (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions (id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);

comment on table public.messages is 'Per-session chat transcript.';

create index messages_session_id_idx on public.messages (session_id, created_at);

alter table public.messages enable row level security;

create policy "anyone can read messages"
  on public.messages
  for select
  to anon, authenticated
  using (true);

create policy "anyone can insert messages"
  on public.messages
  for insert
  to anon, authenticated
  with check (true);

create policy "anyone can update messages"
  on public.messages
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anyone can delete messages"
  on public.messages
  for delete
  to anon, authenticated
  using (true);
