import { createSupabaseClient } from '../client'

export type DbMessage = {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<DbMessage> {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase
    .from('messages')
    .insert({ session_id: sessionId, role, content })
    .select()
    .single()

  if (error) throw new Error(`Failed to save message: ${error.message}`)
  return data as DbMessage
}

export async function getMessages(sessionId: string): Promise<DbMessage[]> {
  const supabase = createSupabaseClient()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to get messages: ${error.message}`)
  return (data ?? []) as DbMessage[]
}
