'use client'

import { useState, useEffect } from 'react'

const SESSION_KEY = 'lca_chatbot_session_id'

/**
 * Returns a stable session UUID for this browser tab.
 * Persisted in localStorage so it survives page refreshes.
 * The same ID is used as:
 *   - useChat `id` → becomes chatId in WorkflowChatTransport requests
 *   - Supabase sessions.id
 *   - Supabase visitor_facts.session_id
 */
export function useChatSession(): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    let id = localStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(SESSION_KEY, id)
    }
    setSessionId(id)

    // Register the session in Supabase (fire-and-forget; idempotent)
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id }),
    }).catch(() => undefined)
  }, [])

  return sessionId
}
