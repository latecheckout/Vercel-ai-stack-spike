-- One row per visitor session. id = chatId from WorkflowChatTransport / useChat.
create table public.sessions (
  id          uuid        primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb       not null default '{}'::jsonb
);

comment on table public.sessions is 'Visitor sessions. id is the client-generated chatId.';

alter table public.sessions enable row level security;

-- Spike has no auth — all access goes through the anon role. Per LCA
-- convention every verb gets its own policy so audit trail is granular.
create policy "anyone can read sessions"
  on public.sessions
  for select
  to anon, authenticated
  using (true);

create policy "anyone can insert sessions"
  on public.sessions
  for insert
  to anon, authenticated
  with check (true);

create policy "anyone can update sessions"
  on public.sessions
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anyone can delete sessions"
  on public.sessions
  for delete
  to anon, authenticated
  using (true);
