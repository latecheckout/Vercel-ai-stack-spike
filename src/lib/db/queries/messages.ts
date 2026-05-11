import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

// Generated `role` is `string`; narrow it for app code.
export type DbMessage = Omit<Tables<'messages'>, 'role'> & {
  role: 'user' | 'assistant'
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<DbMessage> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role, content })
    .select()
    .single()

  if (error) throw new Error(`Failed to save message: ${error.message}`)
  return data as DbMessage
}

export async function getMessages(sessionId: string): Promise<DbMessage[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to get messages: ${error.message}`)
  return (data ?? []) as DbMessage[]
}

/**
 * Wipe the transcript for a session. Used by the Mode 1 confirm-and-reset
 * flow when a visitor deletes a fact — without this, a refresh would pull
 * the stale messages back into useChat via /api/messages-style replay (the
 * spike doesn't replay yet, but the row would still be visible in DB
 * inspection and would surprise anyone wiring replay up later).
 */
export async function clearMessages(sessionId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('session_id', sessionId)

  if (error) throw new Error(`Failed to clear messages: ${error.message}`)
}
