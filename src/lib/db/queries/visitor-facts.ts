import { createSupabaseClient } from '../client'

export type VisitorFact = {
  id: string
  session_id: string
  fact: string
  category: 'company' | 'role' | 'website' | 'project' | 'other'
  source: string
  created_at: string
}

export async function saveVisitorFact(
  sessionId: string,
  fact: string,
  category: VisitorFact['category'],
  source: string,
): Promise<VisitorFact> {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase
    .from('visitor_facts')
    .insert({ session_id: sessionId, fact, category, source })
    .select()
    .single()

  if (error) throw new Error(`Failed to save visitor fact: ${error.message}`)
  return data as VisitorFact
}

export async function getVisitorFacts(sessionId: string): Promise<VisitorFact[]> {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase
    .from('visitor_facts')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to get visitor facts: ${error.message}`)
  return (data ?? []) as VisitorFact[]
}

export async function deleteVisitorFact(factId: string): Promise<void> {
  const supabase = createSupabaseClient()

  const { error } = await supabase.from('visitor_facts').delete().eq('id', factId)

  if (error) throw new Error(`Failed to delete visitor fact: ${error.message}`)
}
