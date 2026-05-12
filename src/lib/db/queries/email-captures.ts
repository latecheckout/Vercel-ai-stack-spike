import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type EmailCapture = Tables<'email_captures'>

export async function saveEmailCapture(input: {
  sessionId: string
  userId: string | null
  email: string
  summary: string
}): Promise<EmailCapture> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('email_captures')
    .insert({
      session_id: input.sessionId,
      user_id: input.userId,
      email: input.email,
      summary: input.summary,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save email capture: ${error.message}`)
  return data
}
