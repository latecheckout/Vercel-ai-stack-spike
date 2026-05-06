import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

// `category` lands as `string` in the generated types because the column
// uses a CHECK constraint, not a true Postgres enum. Narrow it here so
// the panel and tool layer get the union for free.
export type VisitorFactCategory = 'company' | 'role' | 'website' | 'project' | 'other'
export type VisitorFact = Omit<Tables<'visitor_facts'>, 'category'> & {
  category: VisitorFactCategory
}

export async function saveVisitorFact(
  sessionId: string,
  fact: string,
  category: VisitorFactCategory,
  source: string,
): Promise<VisitorFact> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('visitor_facts')
    .insert({ session_id: sessionId, fact, category, source })
    .select()
    .single()

  if (error) throw new Error(`Failed to save visitor fact: ${error.message}`)
  return data as VisitorFact
}

export async function getVisitorFacts(sessionId: string): Promise<VisitorFact[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('visitor_facts')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to get visitor facts: ${error.message}`)
  return (data ?? []) as VisitorFact[]
}

export async function deleteVisitorFact(factId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('visitor_facts').delete().eq('id', factId)

  if (error) throw new Error(`Failed to delete visitor fact: ${error.message}`)
}
