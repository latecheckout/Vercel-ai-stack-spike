import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type Session = Tables<'sessions'>

/**
 * Upsert a session row. Called when the chat initialises so that every
 * session_id that the agent references actually exists in the DB.
 *
 * `userId` (optional) is the auth user id read from `supabase.auth.getUser()`
 * by the caller — typically the API route. We store it on the session so
 * future analytics / migrations to per-user RLS can join on it without
 * trusting the client to round-trip the id.
 *
 * Uses default `ignoreDuplicates: false` semantics — on conflict it
 * performs an UPDATE that sets the columns provided and returns the row.
 */
export async function upsertSession(
  sessionId: string,
  userId?: string | null,
): Promise<Session> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .upsert({ id: sessionId, user_id: userId ?? null }, { onConflict: 'id' })
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
