set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.search_lca_knowledge(q text, max_results integer DEFAULT 3)
 RETURNS TABLE(id uuid, title text, content text, category text, tags text[], source_url text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with parsed as (
    select
      nullif(
        regexp_replace(plainto_tsquery('english', q)::text, ' & ', ' | ', 'g'),
        ''
      )::tsquery as tsq
  )
  select
    lk.id,
    lk.title,
    lk.content,
    lk.category,
    lk.tags,
    lk.source_url,
    ts_rank(lk.search_vector, p.tsq) as rank
  from public.lca_knowledge lk, parsed p
  where p.tsq is not null
    and lk.search_vector @@ p.tsq
  order by rank desc
  limit greatest(max_results, 1)
$function$
;


