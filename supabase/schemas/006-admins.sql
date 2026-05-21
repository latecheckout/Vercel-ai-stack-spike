-- The admin allow-list. Anyone in this table can read/write privileged data
-- via the /admin/* surface; everyone else (including anonymous visitors and
-- signed-up-but-not-promoted users) is denied at the RLS layer and by the
-- proxy gate in src/lib/supabase/proxy.ts.
--
-- Admin status is intentionally a row in a Postgres table rather than a JWT
-- claim. That keeps the gate single-source-of-truth (the policies, the
-- proxy, and the admin pages all call public.is_admin()) and lets us add or
-- revoke access without touching auth provider config or re-issuing tokens.
create table public.admins (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

comment on table public.admins is 'Allow-list of admin users. Membership is the single source of truth for /admin/* access.';

-- SECURITY DEFINER so the function can read public.admins under any caller.
-- The body only checks "does the current auth.uid() have an admins row?",
-- so leaking it is harmless — it never reveals other admin identities.
-- Marked stable so the planner can cache it within a query.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = (select auth.uid())
  )
$$;

comment on function public.is_admin() is 'True when the current auth.uid() has a row in public.admins. Use as the single gate for admin-only RLS predicates and server checks.';

-- Restrict EXECUTE so an anonymous caller cannot probe admin membership.
-- Admins read via the function (for the /admin/admins page), and the proxy
-- calls it server-side via PostgREST RPC with the user's JWT.
revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;

alter table public.admins enable row level security;

-- Reads: admins see admins. Anyone else gets an empty list (which the proxy
-- relies on — it interprets "no row" as "not an admin").
create policy "admins can read admins"
  on public.admins
  for select
  to authenticated
  using ( public.is_admin() );

-- Writes: only admins manage admins. No self-promotion path.
create policy "admins can insert admins"
  on public.admins
  for insert
  to authenticated
  with check ( public.is_admin() );

create policy "admins can update admins"
  on public.admins
  for update
  to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

create policy "admins can delete admins"
  on public.admins
  for delete
  to authenticated
  using ( public.is_admin() );

-- Add an admin by email. SECURITY DEFINER so the function can read
-- auth.users (which `authenticated` cannot select from directly). Lookup
-- is case-insensitive to match Supabase's normalised email storage.
-- Returns the inserted row so the React Query mutation can repaint without
-- a refetch. The "user not found" case bubbles up as a Postgres exception
-- with code P0002, which the client maps to "ask them to sign up first".
create or replace function public.add_admin_by_email(p_email text, p_note text default null)
returns public.admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row     public.admins;
begin
  if not public.is_admin() then
    raise exception 'forbidden: caller is not an admin' using errcode = '42501';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'no user with email %' , p_email using errcode = 'P0002';
  end if;

  insert into public.admins (user_id, note)
  values (v_user_id, p_note)
  on conflict (user_id) do update
    set note = coalesce(excluded.note, public.admins.note)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.add_admin_by_email(text, text) is
  'Promote a signed-up auth.users row to admin by email. Admins only.';

revoke execute on function public.add_admin_by_email(text, text) from public;
grant  execute on function public.add_admin_by_email(text, text) to authenticated;

-- Remove an admin, blocking self-removal at the DB level so the team can't
-- accidentally lock themselves out via a misclick in the UI. The check is
-- in the function rather than a CHECK constraint because we want a clean
-- error message back to the client, not a generic constraint violation.
create or replace function public.remove_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: caller is not an admin' using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'cannot remove yourself — ask another admin' using errcode = '23514';
  end if;

  delete from public.admins where user_id = p_user_id;
end;
$$;

comment on function public.remove_admin(uuid) is
  'Remove an admin row. Blocks self-removal. Admins only.';

revoke execute on function public.remove_admin(uuid) from public;
grant  execute on function public.remove_admin(uuid) to authenticated;

-- Write policies for `lca_knowledge` live here (not in 004) because
-- declarative schema files are applied in numeric order and they depend
-- on public.is_admin() above. The read policy stays in 004 — it has no
-- such dependency.
create policy "admins can insert lca_knowledge"
  on public.lca_knowledge
  for insert
  to authenticated
  with check ( public.is_admin() );

create policy "admins can update lca_knowledge"
  on public.lca_knowledge
  for update
  to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

create policy "admins can delete lca_knowledge"
  on public.lca_knowledge
  for delete
  to authenticated
  using ( public.is_admin() );
