-- One row per visitor session. id = chatId from WorkflowChatTransport / useChat.
-- In practice the client sets id = auth.users.id (the anonymous-auth user id),
-- so a refresh of the same browser keeps the same session.
create table public.sessions (
  id          uuid        primary key,
  user_id     uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  metadata    jsonb       not null default '{}'::jsonb
);

comment on table public.sessions is 'Visitor sessions. id is the client-generated chatId; user_id links to the (usually anonymous) auth user.';

create index sessions_user_id_idx on public.sessions (user_id);

alter table public.sessions enable row level security;

-- Spike has no row-level enforcement — every verb is open to anon and
-- authenticated, but we still keep four explicit policies (one per verb)
-- so audit trail is granular and a future tightening is a one-line change.
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
