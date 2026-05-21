-- supabase db diff does not track function EXECUTE grants, so the
-- declarative schema (supabase/schemas/006-admins.sql) couldn't carry
-- these. This migration enforces what the schema file already declares:
-- only authenticated users may invoke the admin helper functions, so an
-- anonymous caller cannot probe `is_admin()` to learn whether a given
-- session is privileged.
--
-- If/when supabase db diff gains function-grant support these lines can
-- be regenerated and this file deleted.

revoke execute on function public.is_admin()                       from public;
grant  execute on function public.is_admin()                       to authenticated;

revoke execute on function public.add_admin_by_email(text, text)   from public;
grant  execute on function public.add_admin_by_email(text, text)   to authenticated;

revoke execute on function public.remove_admin(uuid)               from public;
grant  execute on function public.remove_admin(uuid)               to authenticated;
