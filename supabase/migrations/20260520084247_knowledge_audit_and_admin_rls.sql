drop policy "service can delete lca_knowledge" on "public"."lca_knowledge";

drop policy "service can insert lca_knowledge" on "public"."lca_knowledge";

drop policy "service can update lca_knowledge" on "public"."lca_knowledge";

alter table "public"."lca_knowledge" add column "created_by" uuid;

alter table "public"."lca_knowledge" add column "updated_at" timestamp with time zone not null default now();

alter table "public"."lca_knowledge" add column "updated_by" uuid;

alter table "public"."lca_knowledge" add constraint "lca_knowledge_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."lca_knowledge" validate constraint "lca_knowledge_created_by_fkey";

alter table "public"."lca_knowledge" add constraint "lca_knowledge_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."lca_knowledge" validate constraint "lca_knowledge_updated_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.lca_knowledge_touch_audit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$
;


  create policy "admins can delete lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for delete
  to authenticated
using (public.is_admin());



  create policy "admins can insert lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for insert
  to authenticated
with check (public.is_admin());



  create policy "admins can update lca_knowledge"
  on "public"."lca_knowledge"
  as permissive
  for update
  to authenticated
using (public.is_admin())
with check (public.is_admin());


CREATE TRIGGER lca_knowledge_touch_audit BEFORE UPDATE ON public.lca_knowledge FOR EACH ROW EXECUTE FUNCTION public.lca_knowledge_touch_audit();


