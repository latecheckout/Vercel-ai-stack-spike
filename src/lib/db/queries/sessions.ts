import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

// `mode` lands as `string` in the generated types (CHECK constraint, not a
// true Postgres enum). Narrow it here so the app layer gets the union.
export type SessionMode = 'chat' | 'summary'
export type Session = Omit<Tables<'sessions'>, 'mode'> & { mode: SessionMode }

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
 * `mode` and `summary` are not in the upsert payload so an existing
 * session's choice survives a re-init.
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
  return data as Session
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
  return data as Session
}

/**
 * Switch the conversation mode. The workflow reads this each turn to decide
 * whether to send the full history (`chat`) or the rolling summary
 * (`summary`).
 */
export async function updateSessionMode(
  sessionId: string,
  mode: SessionMode,
): Promise<Session> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .update({ mode, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update session mode: ${error.message}`)
  return data as Session
}

/**
 * Delete the session row. `messages` and `visitor_facts` both reference
 * `sessions.id` with `on delete cascade`, so a single delete here wipes
 * the whole conversation surface for that id. The orphaned anonymous
 * `auth.users` row is left behind — Supabase doesn't auto-delete those
 * and the spike doesn't need to.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('sessions').delete().eq('id', sessionId)

  if (error) throw new Error(`Failed to delete session: ${error.message}`)
}

/**
 * Replace the rolling summary. Called from the post-turn workflow step in
 * summary mode and from the regenerate-summary endpoint after a fact
 * deletion.
 */
export async function updateSessionSummary(
  sessionId: string,
  summary: string,
): Promise<Session> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .update({ summary, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single()

  if (error)
    throw new Error(`Failed to update session summary: ${error.message}`)
  return data as Session
}
