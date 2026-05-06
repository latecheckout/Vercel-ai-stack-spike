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
