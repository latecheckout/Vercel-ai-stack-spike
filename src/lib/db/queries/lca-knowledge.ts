export type LcaKnowledgeHit = {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  source_url: string | null
  rank: number
}

/**
 * Full-text search over lca_knowledge. Calls the
 * `search_lca_knowledge(q, max_results)` SQL function — see
 * supabase/schemas/004-lca-knowledge.sql.
 *
 * Must only be called from a `'use step'` step function (i.e. from the
 * step worker route handler). The workflow flow worker has no global
 * `fetch` / `AbortSignal` / `WebSocket`, so a tool's execute body cannot
 * call this directly — wrap it in a step. See `searchLcaKnowledgeStep`
 * in `src/lib/agent/chat/steps.ts`.
 *
 * Implemented with `fetch` against PostgREST instead of `@supabase/supabase-js`
 * to avoid pulling in the Realtime client (which the step bundle doesn't
 * need and which would re-introduce the WebSocket dependency).
 */
export async function searchLcaKnowledge(
  query: string,
  limit = 3,
): Promise<LcaKnowledgeHit[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.',
    )
  }

  const res = await fetch(`${url}/rest/v1/rpc/search_lca_knowledge`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: trimmed, max_results: limit }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    throw new Error(
      `lca_knowledge search failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    )
  }

  return (await res.json()) as LcaKnowledgeHit[]
}
