'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const SESSION_KEY = 'lca_chatbot_session_id'

/**
 * Returns a stable session UUID for this browser tab.
 *
 * On first mount we make sure the visitor has a Supabase auth session — if
 * they're not signed in, we call `signInAnonymously()` to mint an anonymous
 * user (this requires Anonymous Sign-Ins to be enabled in the Supabase
 * project's Auth → Providers settings). The auth user id is what we use as
 * the session id, and it doubles as `chatId` for `WorkflowChatTransport`,
 * `sessions.id` in Postgres, and the foreign key for `visitor_facts.session_id`.
 *
 * We also write the id to localStorage so a refresh resolves instantly without
 * waiting on the auth round-trip — but the auth user id is the source of truth
 * and overwrites localStorage if it ever differs (e.g. after sign-out).
 */
export function useChatSession(): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function ensureSession() {
      // Check for an existing auth session first. getUser() validates the
      // JWT against Supabase rather than trusting the local cookie — that
      // matters if the anon user was deleted server-side.
      const {
        data: { user: existingUser },
      } = await supabase.auth.getUser()

      let userId = existingUser?.id ?? null

      if (!userId) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error || !data.user) {
          console.error('[useChatSession] anonymous sign-in failed', error)
          return
        }
        userId = data.user.id
      }

      if (cancelled) return

      localStorage.setItem(SESSION_KEY, userId)
      setSessionId(userId)

      // Make sure the session row exists in Postgres so message inserts and
      // visitor-fact inserts have a parent. Idempotent.
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: userId }),
      }).catch(() => undefined)
    }

    ensureSession()
    return () => {
      cancelled = true
    }
  }, [])

  return sessionId
}
