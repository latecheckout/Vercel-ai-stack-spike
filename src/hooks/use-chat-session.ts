'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const SESSION_KEY = 'lca_chatbot_session_id'

export interface ChatSession {
  sessionId: string | null
  /** Sign the current anonymous user out and mint a fresh one. Returns the
   *  new auth user id (which is also the new chat session id) so the caller
   *  can chain follow-up work without waiting for React state to settle. */
  resetSession: () => Promise<string | null>
}

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
 * `resetSession` lets the "Start over" button rotate the anonymous identity
 * without a full page reload — sign out drops the cached cookies, sign in
 * mints a brand-new auth user, and the new id flows back through React
 * state so the chat surface, panel queries, and useChat all re-key onto it.
 */
export function useChatSession(): ChatSession {
  const [sessionId, setSessionId] = useState<string | null>(null)
  // Latest setter wins — guards against a concurrent reset clobbering a
  // newer sign-in (e.g. button double-click during slow network).
  const generationRef = useRef(0)

  // Idempotent server-side ensure-row call. Lives outside the effect so
  // both the initial mount and `resetSession` can reuse it.
  const ensureSessionRow = useCallback((userId: string) => {
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: userId }),
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const generation = ++generationRef.current

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

      if (cancelled || generation !== generationRef.current) return

      localStorage.setItem(SESSION_KEY, userId)
      setSessionId(userId)
      ensureSessionRow(userId)
    }

    ensureSession()
    return () => {
      cancelled = true
    }
  }, [ensureSessionRow])

  const resetSession = useCallback(async (): Promise<string | null> => {
    const supabase = createClient()
    const generation = ++generationRef.current

    // Pull the rug on stale state before the sign-out round-trip so the
    // panel and chat surface render an empty / loading state instead of
    // briefly pointing at the just-deleted session.
    setSessionId(null)
    localStorage.removeItem(SESSION_KEY)

    await supabase.auth.signOut()
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      console.error('[useChatSession] anonymous sign-in (reset) failed', error)
      return null
    }

    if (generation !== generationRef.current) return null

    const userId = data.user.id
    localStorage.setItem(SESSION_KEY, userId)
    setSessionId(userId)
    ensureSessionRow(userId)
    return userId
  }, [ensureSessionRow])

  return { sessionId, resetSession }
}
