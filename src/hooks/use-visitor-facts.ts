'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { VisitorFact } from '@/lib/db/queries/visitor-facts'

const POLL_INTERVAL_MS = 3_000 // poll every 3 s while the agent is active

/**
 * Fetches visitor facts for the current session and re-fetches on an interval
 * so the panel updates as the agent calls save_visitor_fact.
 */
export function useVisitorFacts(sessionId: string | null) {
  return useQuery<VisitorFact[]>({
    queryKey: ['visitor-facts', sessionId],
    queryFn: async () => {
      if (!sessionId) return []
      const res = await fetch(`/api/visitor-facts/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch visitor facts')
      const data = (await res.json()) as { facts: VisitorFact[] }
      return data.facts
    },
    enabled: !!sessionId,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  })
}

/**
 * Mutation: delete a visitor fact.
 * Optimistically removes from the cache, refetches on settle.
 */
export function useDeleteVisitorFact(sessionId: string | null) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (factId: string) => {
      if (!sessionId) throw new Error('No session')
      const res = await fetch(`/api/visitor-facts/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factId }),
      })
      if (!res.ok) throw new Error('Failed to delete visitor fact')
    },
    onMutate: async (factId) => {
      await qc.cancelQueries({ queryKey: ['visitor-facts', sessionId] })
      const previous = qc.getQueryData<VisitorFact[]>(['visitor-facts', sessionId])
      qc.setQueryData<VisitorFact[]>(
        ['visitor-facts', sessionId],
        (old) => old?.filter((f) => f.id !== factId) ?? [],
      )
      return { previous }
    },
    onError: (_err, _factId, context) => {
      if (context?.previous) {
        qc.setQueryData(['visitor-facts', sessionId], context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['visitor-facts', sessionId] })
    },
  })
}
