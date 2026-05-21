-- Seed runs on `supabase db reset` (local only — not applied to hosted prod).
-- Used to bootstrap data the migrations can't carry: anything that depends
-- on auth.users rows (which migrations don't create).

-- Founding admin bootstrap.
--
-- Promotes the local dev user identified by FOUNDING_ADMIN_EMAIL below to
-- admin if their auth.users row exists. Idempotent — re-running this file
-- (or `supabase db reset`) is safe.
--
-- Order of operations the first time you set up locally:
--   1. supabase start          (Postgres up)
--   2. supabase db reset       (migrations + this seed — admins is empty)
--   3. pnpm dev                (open /admin/signup, create your account)
--   4. supabase db reset       (re-runs this seed; your row now exists in
--                               auth.users, so it gets promoted to admin)
--
-- For hosted environments (preview / prod) this file does NOT run. Open
-- the Supabase SQL editor once after first deploy and run:
--
--   insert into public.admins (user_id, note)
--   select id, 'founding admin'
--   from   auth.users
--   where  lower(email) = lower('you@example.com')
--   on conflict (user_id) do nothing;
--
-- Edit the email below to whichever account is the founding admin for
-- *this* developer's local DB. Don't commit your colleague's email here —
-- their local DB will silently inherit it. Use git's local-only
-- update-index --skip-worktree if you need to override personally.
insert into public.admins (user_id, note)
select u.id, 'founding admin (seeded locally)'
from   auth.users u
where  lower(u.email) = lower('anthony@latecheckout.studio')
on conflict (user_id) do nothing;
