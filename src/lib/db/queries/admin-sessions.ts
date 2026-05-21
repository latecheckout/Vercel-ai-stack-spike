import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

export type SessionSummary = Tables<'sessions'> & {
  message_count: number
  fact_count: number
  last_message_at: string | null
}

/**
 * List sessions with cheap aggregates for the inspector index. We hit
 * three tables but only one round-trip per (no joins because PostgREST
 * aggregates are clunky) — the spike rarely has more than a few hundred
 * sessions so a fanout query is fine.
 */
export async function listSessions(limit = 100): Promise<SessionSummary[]> {
  const supabase = await createClient()
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listSessions: ${error.message}`)
  if (!sessions || sessions.length === 0) return []

  const ids = sessions.map((s) => s.id)

  const [{ data: msgRows }, { data: factRows }] = await Promise.all([
    supabase.from('messages').select('session_id, created_at').in('session_id', ids),
    supabase.from('visitor_facts').select('session_id').in('session_id', ids),
  ])

  const messageCount = new Map<string, number>()
  const lastMessage = new Map<string, string>()
  for (const m of msgRows ?? []) {
    messageCount.set(m.session_id, (messageCount.get(m.session_id) ?? 0) + 1)
    const cur = lastMessage.get(m.session_id)
    if (!cur || m.created_at > cur) lastMessage.set(m.session_id, m.created_at)
  }

  const factCount = new Map<string, number>()
  for (const f of factRows ?? []) {
    factCount.set(f.session_id, (factCount.get(f.session_id) ?? 0) + 1)
  }

  return sessions.map((s) => ({
    ...s,
    message_count: messageCount.get(s.id) ?? 0,
    fact_count: factCount.get(s.id) ?? 0,
    last_message_at: lastMessage.get(s.id) ?? null,
  }))
}

export type SessionDetail = {
  session: Tables<'sessions'>
  messages: Tables<'messages'>[]
  facts: Tables<'visitor_facts'>[]
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const supabase = await createClient()
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (sErr) throw new Error(`getSessionDetail.session: ${sErr.message}`)
  if (!session) return null

  const [{ data: messages, error: mErr }, { data: facts, error: fErr }] = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    supabase
      .from('visitor_facts')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
  ])
  if (mErr) throw new Error(`getSessionDetail.messages: ${mErr.message}`)
  if (fErr) throw new Error(`getSessionDetail.facts: ${fErr.message}`)

  return { session, messages: messages ?? [], facts: facts ?? [] }
}
