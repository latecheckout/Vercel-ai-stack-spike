
  create table "public"."email_captures" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "user_id" uuid,
    "email" text not null,
    "summary" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."email_captures" enable row level security;

alter table "public"."sessions" add column "user_id" uuid;

CREATE INDEX email_captures_email_idx ON public.email_captures USING btree (lower(email));

CREATE UNIQUE INDEX email_captures_pkey ON public.email_captures USING btree (id);

CREATE INDEX email_captures_session_id_idx ON public.email_captures USING btree (session_id, created_at);

CREATE INDEX email_captures_user_id_idx ON public.email_captures USING btree (user_id);

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);

alter table "public"."email_captures" add constraint "email_captures_pkey" PRIMARY KEY using index "email_captures_pkey";

alter table "public"."email_captures" add constraint "email_captures_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;

alter table "public"."email_captures" validate constraint "email_captures_session_id_fkey";

alter table "public"."email_captures" add constraint "email_captures_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."email_captures" validate constraint "email_captures_user_id_fkey";

alter table "public"."sessions" add constraint "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."sessions" validate constraint "sessions_user_id_fkey";

grant delete on table "public"."email_captures" to "anon";

grant insert on table "public"."email_captures" to "anon";

grant references on table "public"."email_captures" to "anon";

grant select on table "public"."email_captures" to "anon";

grant trigger on table "public"."email_captures" to "anon";

grant truncate on table "public"."email_captures" to "anon";

grant update on table "public"."email_captures" to "anon";

grant delete on table "public"."email_captures" to "authenticated";

grant insert on table "public"."email_captures" to "authenticated";

grant references on table "public"."email_captures" to "authenticated";

grant select on table "public"."email_captures" to "authenticated";

grant trigger on table "public"."email_captures" to "authenticated";

grant truncate on table "public"."email_captures" to "authenticated";

grant update on table "public"."email_captures" to "authenticated";

grant delete on table "public"."email_captures" to "service_role";

grant insert on table "public"."email_captures" to "service_role";

grant references on table "public"."email_captures" to "service_role";

grant select on table "public"."email_captures" to "service_role";

grant trigger on table "public"."email_captures" to "service_role";

grant truncate on table "public"."email_captures" to "service_role";

grant update on table "public"."email_captures" to "service_role";


  create policy "anyone can delete email_captures"
  on "public"."email_captures"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "anyone can insert email_captures"
  on "public"."email_captures"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "anyone can read email_captures"
  on "public"."email_captures"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anyone can update email_captures"
  on "public"."email_captures"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



