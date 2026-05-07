alter table "public"."lca_knowledge" drop constraint "lca_knowledge_category_check";

alter table "public"."lca_knowledge" drop column "embedding";

alter table "public"."lca_knowledge" add column "search_vector" tsvector;

alter table "public"."lca_knowledge" add column "source_url" text;

alter table "public"."lca_knowledge" add column "tags" text[] not null default '{}'::text[];

drop extension if exists "vector";

CREATE INDEX lca_knowledge_search_idx ON public.lca_knowledge USING gin (search_vector);

CREATE UNIQUE INDEX lca_knowledge_source_url_key ON public.lca_knowledge USING btree (source_url);

alter table "public"."lca_knowledge" add constraint "lca_knowledge_source_url_key" UNIQUE using index "lca_knowledge_source_url_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.lca_knowledge_refresh_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.tags, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.content, '')), 'B');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.search_lca_knowledge(q text, max_results integer DEFAULT 3)
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], source_url text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    lk.id,
    lk.title,
    lk.content,
    lk.category,
    lk.tags,
    lk.source_url,
    ts_rank_cd(lk.search_vector, websearch_to_tsquery('english', q)) as rank
  from public.lca_knowledge lk
  where lk.search_vector @@ websearch_to_tsquery('english', q)
  order by rank desc
  limit greatest(max_results, 1)
$function$
;

CREATE TRIGGER lca_knowledge_search_vector_sync BEFORE INSERT OR UPDATE OF title, content, tags ON public.lca_knowledge FOR EACH ROW EXECUTE FUNCTION public.lca_knowledge_refresh_search_vector();


