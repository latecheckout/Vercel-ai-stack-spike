
  create table "public"."admins" (
    "user_id" uuid not null,
    "note" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."admins" enable row level security;

CREATE UNIQUE INDEX admins_pkey ON public.admins USING btree (user_id);

alter table "public"."admins" add constraint "admins_pkey" PRIMARY KEY using index "admins_pkey";

alter table "public"."admins" add constraint "admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."admins" validate constraint "admins_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_admin_by_email(p_email text, p_note text DEFAULT NULL::text)
 RETURNS public.admins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.admins
    where user_id = (select auth.uid())
  )
$function$
;

CREATE OR REPLACE FUNCTION public.remove_admin(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'forbidden: caller is not an admin' using errcode = '42501';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'cannot remove yourself — ask another admin' using errcode = '23514';
  end if;

  delete from public.admins where user_id = p_user_id;
end;
$function$
;

grant delete on table "public"."admins" to "anon";

grant insert on table "public"."admins" to "anon";

grant references on table "public"."admins" to "anon";

grant select on table "public"."admins" to "anon";

grant trigger on table "public"."admins" to "anon";

grant truncate on table "public"."admins" to "anon";

grant update on table "public"."admins" to "anon";

grant delete on table "public"."admins" to "authenticated";

grant insert on table "public"."admins" to "authenticated";

grant references on table "public"."admins" to "authenticated";

grant select on table "public"."admins" to "authenticated";

grant trigger on table "public"."admins" to "authenticated";

grant truncate on table "public"."admins" to "authenticated";

grant update on table "public"."admins" to "authenticated";

grant delete on table "public"."admins" to "service_role";

grant insert on table "public"."admins" to "service_role";

grant references on table "public"."admins" to "service_role";

grant select on table "public"."admins" to "service_role";

grant trigger on table "public"."admins" to "service_role";

grant truncate on table "public"."admins" to "service_role";

grant update on table "public"."admins" to "service_role";


  create policy "admins can delete admins"
  on "public"."admins"
  as permissive
  for delete
  to authenticated
using (public.is_admin());



  create policy "admins can insert admins"
  on "public"."admins"
  as permissive
  for insert
  to authenticated
with check (public.is_admin());



  create policy "admins can read admins"
  on "public"."admins"
  as permissive
  for select
  to authenticated
using (public.is_admin());



  create policy "admins can update admins"
  on "public"."admins"
  as permissive
  for update
  to authenticated
using (public.is_admin())
with check (public.is_admin());



