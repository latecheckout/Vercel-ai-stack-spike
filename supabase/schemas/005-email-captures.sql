-- Email captures collected at the end of a chat session, paired with an
-- LLM-generated summary of the conversation. Surfaced in the chat UI as a
-- "looks like you're done — leave us your email" card after a few minutes
-- of inactivity.
create table public.email_captures (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references public.sessions (id) on delete cascade,
  user_id     uuid        references auth.users (id) on delete set null,
  email       text        not null,
  summary     text        not null,
  created_at  timestamptz not null default now()
);

comment on table public.email_captures is 'Email + conversation summary captured at end-of-chat CTA.';

create index email_captures_session_id_idx on public.email_captures (session_id, created_at);
create index email_captures_user_id_idx    on public.email_captures (user_id);
create index email_captures_email_idx      on public.email_captures (lower(email));

alter table public.email_captures enable row level security;

-- Spike RLS — open to anon + authenticated, four explicit policies.
create policy "anyone can read email_captures"
  on public.email_captures
  for select
  to anon, authenticated
  using (true);

create policy "anyone can insert email_captures"
  on public.email_captures
  for insert
  to anon, authenticated
  with check (true);

create policy "anyone can update email_captures"
  on public.email_captures
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anyone can delete email_captures"
  on public.email_captures
  for delete
  to anon, authenticated
  using (true);
