import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type Session = Tables<'sessions'>

/**
 * Upsert a session row. Called when the chat initialises so that every
 * session_id that the agent references actually exists in the DB.
 *
 * Uses default `ignoreDuplicates: false` semantics — on conflict it
 * performs an UPDATE that sets only the columns provided (just `id`,
 * a no-op for the existing row) and returns it. `ignoreDuplicates: true`
 * would translate to `ON CONFLICT DO NOTHING`, which returns 0 rows and
 * makes `.single()` throw on every re-init of an existing session.
 */
export async function upsertSession(sessionId: string): Promise<Session> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .upsert({ id: sessionId }, { onConflict: 'id' })
    .select()
    .single()

  if (error) throw new Error(`Failed to upsert session: ${error.message}`)
  return data
}

/**
 * Get a session by ID. Returns null if not found.
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error && error.code === 'PGRST116') return null
  if (error) throw new Error(`Failed to get session: ${error.message}`)
  return data
}
