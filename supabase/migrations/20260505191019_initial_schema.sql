create extension if not exists "vector" with schema "public";


  create table "public"."lca_knowledge" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "content" text not null,
    "category" text not null,
    "embedding" public.vector(1536),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."lca_knowledge" enable row level security;


  create table "public"."messages" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "role" text not null,
    "content" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."messages" enable row level security;


  create table "public"."sessions" (
    "id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "metadata" jsonb not null default '{}'::jsonb
      );


alter table "public"."sessions" enable row level security;


  create table "public"."visitor_facts" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "fact" text not null,
    "category" text not null,
    "source" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."visitor_facts" enable row level security;

CREATE INDEX lca_knowledge_category_idx ON public.lca_knowledge USING btree (category);

CREATE UNIQUE INDEX lca_knowledge_pkey ON public.lca_knowledge USING btree (id);

CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id);

CREATE INDEX messages_session_id_idx ON public.messages USING btree (session_id, created_at);

CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);

CREATE UNIQUE INDEX visitor_facts_pkey ON public.visitor_facts USING btree (id);

CREATE INDEX visitor_facts_session_id_idx ON public.visitor_facts USING btree (session_id, created_at);

alter table "public"."lca_knowledge" add constraint "lca_knowledge_pkey" PRIMARY KEY using index "lca_knowledge_pkey";

alter table "public"."messages" add constraint "messages_pkey" PRIMARY KEY using index "messages_pkey";

alter table "public"."sessions" add constraint "sessions_pkey" PRIMARY KEY using index "sessions_pkey";

alter table "public"."visitor_facts" add constraint "visitor_facts_pkey" PRIMARY KEY using index "visitor_facts_pkey";

alter table "public"."lca_knowledge" add constraint "lca_knowledge_category_check" CHECK ((category = ANY (ARRAY['service'::text, 'case-study'::text, 'approach'::text, 'engagement'::text, 'faq'::text]))) not valid;

alter table "public"."lca_knowledge" validate constraint "lca_knowledge_category_check";

alter table "public"."messages" add constraint "messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text]))) not valid;

alter table "public"."messages" validate constraint "messages_role_check";

alter table "public"."messages" add constraint "messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;

alter table "public"."messages" validate constraint "messages_session_id_fkey";

alter table "public"."visitor_facts" add constraint "visitor_facts_category_check" CHECK ((category = ANY (ARRAY['company'::text, 'role'::text, 'website'::text, 'project'::text, 'other'::text]))) not valid;

alter table "public"."visitor_facts" validate constraint "visitor_facts_category_check";

alter table "public"."visitor_facts" add constraint "visitor_facts_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE not valid;

alter table "public"."visitor_facts" validate constraint "visitor_facts_session_id_fkey";

grant delete on table "public"."lca_knowledge" to "anon";

grant insert on table "public"."lca_knowledge" to "anon";

grant references on table "public"."lca_knowledge" to "anon";

grant select on table "public"."lca_knowledge" to "anon";

grant trigger on table "public"."lca_knowledge" to "anon";

grant truncate on table "public"."lca_knowledge" to "anon";

grant update on table "public"."lca_knowledge" to "anon";

grant delete on table "public"."lca_knowledge" to "authenticated";

grant insert on table "public"."lca_knowledge" to "authenticated";

grant references on table "public"."lca_knowledge" to "authenticated";

grant select on table "public"."lca_knowledge" to "authenticated";

grant trigger on table "public"."lca_knowledge" to "authenticated";

grant truncate on table "public"."lca_knowledge" to "authenticated";

grant update on table "public"."lca_knowledge" to "authenticated";

grant delete on table "public"."lca_knowledge" to "service_role";

grant insert on table "public"."lca_knowledge" to "service_role";

grant references on table "public"."lca_knowledge" to "service_role";

grant select on table "public"."lca_knowledge" to "service_role";

grant trigger on table "public"."lca_knowledge" to "service_role";

grant truncate on table "public"."lca_knowledge" to "service_role";

grant update on table "public"."lca_knowledge" to "service_role";

grant delete on table "public"."messages" to "anon";

grant insert on table "public"."messages" to "anon";

grant references on table "public"."messages" to "anon";

grant select on table "public"."messages" to "anon";

grant trigger on table "public"."messages" to "anon";

grant truncate on table "public"."messages" to "anon";

grant update on table "public"."messages" to "anon";

grant delete on table "public"."messages" to "authenticated";

grant insert on table "public"."messages" to "authenticated";

grant references on table "public"."messages" to "authenticated";

grant select on table "public"."messages" to "authenticated";

grant trigger on table "public"."messages" to "authenticated";

grant truncate on table "public"."messages" to "authenticated";

grant update on table "public"."messages" to "authenticated";

grant delete on table "public"."messages" to "service_role";

grant insert on table "public"."messages" to "service_role";

grant references on table "public"."messages" to "service_role";

grant select on table "public"."messages" to "service_role";

grant trigger on table "public"."messages" to "service_role";

grant truncate on table "public"."messages" to "service_role";

grant update on table "public"."messages" to "service_role";

grant delete on table "public"."sessions" to "anon";

grant insert on table "public"."sessions" to "anon";

grant references on table "public"."sessions" to "anon";

grant select on table "public"."sessions" to "anon";

grant trigger on table "public"."sessions" to "anon";

grant truncate on table "public"."sessions" to "anon";

grant update on table "public"."sessions" to "anon";

grant delete on table "public"."sessions" to "authenticated";

grant insert on table "public"."sessions" to "authenticated";

grant references on table "public"."sessions" to "authenticated";

grant select on table "public"."sessions" to "authenticated";

grant trigger on table "public"."sessions" to "authenticated";

grant truncate on table "public"."sessions" to "authenticated";

grant update on table "public"."sessions" to "authenticated";

grant delete on table "public"."sessions" to "service_role";

grant insert on table "public"."sessions" to "service_role";

grant references on table "public"."sessions" to "service_role";

grant select on table "public"."sessions" to "service_role";

grant trigger on table "public"."sessions" to "service_role";

grant truncate on table "public"."sessions" to "service_role";

grant update on table "public"."sessions" to "service_role";

grant delete on table "public"."visitor_facts" to "anon";

grant insert on table "public"."visitor_facts" to "anon";

grant references on table "public"."visitor_facts" to "anon";

grant select on table "public"."visitor_facts" to "anon";

grant trigger on table "public"."visitor_facts" to "anon";

grant truncate on table "public"."visitor_facts" to "anon";

grant update on table "public"."visitor_facts" to "anon";

grant delete on table "public"."visitor_facts" to "authenticated";

grant insert on table "public"."visitor_facts" to "authenticated";

grant references on table "public"."visitor_facts" to "authenticated";

grant select on table "public"."visitor_facts" to "authenticated";

grant trigger on table "public"."visitor_facts" to "authenticated";

grant truncate on table "public"."visitor_facts" to "authenticated";

grant update on table "public"."visitor_facts" to "authenticated";

grant delete on table "public"."visitor_facts" to "service_role";

grant insert on table "public"."visitor_facts" to "service_role";

grant references on table "public"."visitor_facts" to "service_role";

grant select on table "public"."visitor_facts" to "service_role";

grant trigger on table "public"."visitor_facts" to "service_role";

grant truncate on table "public"."visitor_facts" to "service_role";

grant update on table "public"."visitor_facts" to "service_role";


  create policy "anyone can read lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "service can delete lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for delete
  to service_role
using (true);



  create policy "service can insert lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for insert
  to service_role
with check (true);



  create policy "service can update lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for update
  to service_role
using (true)
with check (true);



  create policy "anyone can delete messages"
  on "public"."messages"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "anyone can insert messages"
  on "public"."messages"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "anyone can read messages"
  on "public"."messages"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anyone can update messages"
  on "public"."messages"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



  create policy "anyone can delete sessions"
  on "public"."sessions"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "anyone can insert sessions"
  on "public"."sessions"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "anyone can read sessions"
  on "public"."sessions"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anyone can update sessions"
  on "public"."sessions"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



  create policy "anyone can delete visitor_facts"
  on "public"."visitor_facts"
  as permissive
  for delete
  to anon, authenticated
using (true);



  create policy "anyone can insert visitor_facts"
  on "public"."visitor_facts"
  as permissive
  for insert
  to anon, authenticated
with check (true);



  create policy "anyone can read visitor_facts"
  on "public"."visitor_facts"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "anyone can update visitor_facts"
  on "public"."visitor_facts"
  as permissive
  for update
  to anon, authenticated
using (true)
with check (true);



