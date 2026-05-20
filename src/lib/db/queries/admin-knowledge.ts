import { createClient } from '@/lib/supabase/server'
import type { KnowledgeRow } from '@/lib/db/queries/admin-knowledge-shared'

export type { KnowledgeRow, KnowledgeInsert, KnowledgeUpdate, KnowledgeCategory } from '@/lib/db/queries/admin-knowledge-shared'
export { KNOWLEDGE_CATEGORIES } from '@/lib/db/queries/admin-knowledge-shared'

/**
 * All knowledge rows, newest first. Used by the /admin/knowledge list page.
 * Caller is always an authenticated admin (proxy enforces) so RLS lets the
 * full payload through.
 */
export async function listKnowledge(): Promise<KnowledgeRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lca_knowledge')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`listKnowledge: ${error.message}`)
  return data ?? []
}

export async function getKnowledge(id: string): Promise<KnowledgeRow | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lca_knowledge')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getKnowledge: ${error.message}`)
  return data
}
