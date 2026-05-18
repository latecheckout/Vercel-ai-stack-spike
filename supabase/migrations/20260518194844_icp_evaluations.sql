
  create table "public"."icp_evaluations" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "score" integer not null,
    "tier" text not null,
    "rationale" text not null default ''::text,
    "signals" jsonb not null default '{}'::jsonb,
    "recommendation" text not null default ''::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."icp_evaluations" enable row level security;

CREATE UNIQUE INDEX icp_evaluations_pkey ON public.icp_evaluations USING btree (id);

CREATE INDEX icp_evaluations_session_id_idx ON public.icp_evaluations USING btree (session_id, created_at DESC);

alter table "public"."icp_evaluations" add constraint "icp_evaluations_pkey" PRIMARY KEY using index "icp_evaluations_pkey";

alter table "public"."icp_evaluations" add constraint "icp_evaluations_score_check" CHECK (((score >= 0) AND (score <= 100))) not valid;

alter table "public"."icp_evaluations" validate constraint "icp_evaluations_score_check";

alter table "public"."icp_evaluations" add constraint "icp_evaluations_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;

alter table "public"."icp_evaluations" validate constraint "icp_evaluations_session_id_fkey";

alter table "public"."icp_evaluations" add constraint "icp_evaluations_tier_check" CHECK ((tier = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'unclear'::text]))) not valid;

alter table "public"."icp_evaluations" validate constraint "icp_evaluations_tier_check";

grant delete on table "public"."icp_evaluations" to "anon";

grant insert on table "public"."icp_evaluations" to "anon";

grant references on table "public"."icp_evaluations" to "anon";

grant select on table "public"."icp_evaluations" to "anon";

grant trigger on table "public"."icp_evaluations" to "anon";

grant truncate on table "public"."icp_evaluations" to "anon";

grant update on table "public"."icp_evaluations" to "anon";

grant delete on table "public"."icp_evaluations" to "authenticated";

grant insert on table "public"."icp_evaluations" to "authenticated";

grant references on table "public"."icp_evaluations" to "authenticated";

grant select on table "public"."icp_evaluations" to "authenticated";

grant trigger on table "public"."icp_evaluations" to "authenticated";

grant truncate on table "public"."icp_evaluations" to "authenticated";

grant update on table "public"."icp_evaluations" to "authenticated";

grant delete on table "public"."icp_evaluations" to "service_role";

grant insert on table "public"."icp_evaluations" to "service_role";

grant references on table "public"."icp_evaluations" to "service_role";

grant select on table "public"."icp_evaluations" to "service_role";

grant trigger on table "public"."icp_evaluations" to "service_role";

grant truncate on table "public"."icp_evaluations" to "service_role";

grant update on table "public"."icp_evaluations" to "service_role";


  create policy "anyone can delete icp_evaluations"
  on "public"."icp_evaluations"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "anyone can insert icp_evaluations"
  on "public"."icp_evaluations"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "anyone can read icp_evaluations"
  on "public"."icp_evaluations"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anyone can update icp_evaluations"
  on "public"."icp_evaluations"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



