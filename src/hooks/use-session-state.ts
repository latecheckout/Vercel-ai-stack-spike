'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionMode } from '@/lib/db/queries/sessions'

export interface SessionState {
  id: string
  mode: SessionMode
  summary: string
}

const POLL_INTERVAL_MS = 3_000

/**
 * Fetches `{ mode, summary }` for the current session and polls so the
 * summary panel updates as the workflow rewrites it mid-stream.
 */
export function useSessionState(sessionId: string | null) {
  return useQuery<SessionState>({
    queryKey: ['session-state', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No session')
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch session state')
      const data = (await res.json()) as { session: SessionState }
      return data.session
    },
    enabled: !!sessionId,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  })
}

/**
 * Mutation: toggle conversation mode. Optimistically updates the cache so
 * the toggle feels instant; the server may still rewrite `summary` on a
 * chat → summary transition (initial summary seeding), so the response
 * replaces the cache when it lands.
 */
export function useUpdateSessionMode(sessionId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (mode: SessionMode) => {
      if (!sessionId) throw new Error('No session')
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { session: SessionState }
      return data.session
    },
    onMutate: async (mode) => {
      await qc.cancelQueries({ queryKey: ['session-state', sessionId] })
      const previous = qc.getQueryData<SessionState>([
        'session-state',
        sessionId,
      ])
      if (previous) {
        qc.setQueryData<SessionState>(['session-state', sessionId], {
          ...previous,
          mode,
        })
      }
      return { previous }
    },
    onError: (_err, _mode, context) => {
      if (context?.previous) {
        qc.setQueryData(['session-state', sessionId], context.previous)
      }
    },
    onSuccess: (session) => {
      qc.setQueryData(['session-state', sessionId], session)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['session-state', sessionId] })
    },
  })
}

/**
 * POST the reset endpoint (Mode 1 fact-deletion path). Wipes server-side
 * transcript and summary; the caller is responsible for also clearing the
 * useChat in-memory message list.
 */
export function useResetSession(sessionId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session')
      const res = await fetch(`/api/sessions/${sessionId}/reset`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to reset session')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['session-state', sessionId] })
    },
  })
}

/**
 * POST the hard-reset endpoint — "start over" button. Drops the session
 * row entirely; `messages` and `visitor_facts` cascade off, so this
 * wipes facts + transcript + summary in one shot. Caller is responsible
 * for clearing useChat state and rotating the anonymous auth user.
 */
export function useHardResetSession(sessionId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No session')
      const res = await fetch(`/api/sessions/${sessionId}/hard-reset`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to hard-reset session')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['session-state', sessionId] })
      qc.invalidateQueries({ queryKey: ['visitor-facts', sessionId] })
    },
  })
}

/**
 * POST the regenerate-summary endpoint (Mode 2 fact-deletion path).
 * The deletion of the fact itself is a separate call — by the time this
 * fires, the facts list on the server is already the post-deletion view.
 */
export function useRegenerateSummary(sessionId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (removedFact: string) => {
      if (!sessionId) throw new Error('No session')
      const res = await fetch(
        `/api/sessions/${sessionId}/regenerate-summary`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ removedFact }),
        },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { session: SessionState }
      return data.session
    },
    onSuccess: (session) => {
      qc.setQueryData(['session-state', sessionId], session)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['session-state', sessionId] })
    },
  })
}
