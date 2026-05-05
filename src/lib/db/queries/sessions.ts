import { createSupabaseClient } from '../client'

export type Session = {
  id: string
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

/**
 * Upsert a session row. Called when the chat initialises so that every
 * session_id that the agent references actually exists in the DB.
 */
export async function upsertSession(sessionId: string): Promise<Session> {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase
    .from('sessions')
    .upsert({ id: sessionId }, { onConflict: 'id', ignoreDuplicates: true })
    .select()
    .single()

  if (error) throw new Error(`Failed to upsert session: ${error.message}`)
  return data as Session
}

/**
 * Get a session by ID. Returns null if not found.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error && error.code === 'PGRST116') return null
  if (error) throw new Error(`Failed to get session: ${error.message}`)
  return data as Session
}
