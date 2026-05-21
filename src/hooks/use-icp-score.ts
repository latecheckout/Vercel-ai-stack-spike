'use client'

import { useQuery } from '@tanstack/react-query'
import type { IcpEvaluation } from '@/lib/db/queries/icp-evaluations'
import { POLL_INTERVAL_MS } from '@/lib/config'

/**
 * Polls `/api/icp/[sessionId]` for the most recent ICP evaluation. Returns
 * `null` once loaded if no evaluation has been produced yet (fresh
 * session, or the first eval is still in-flight). The evaluator runs in
 * the workflow's `onFinish`, so the first row lands shortly after the
 * agent finishes its first reply.
 */
export function useIcpScore(sessionId: string | null) {
  return useQuery<IcpEvaluation | null>({
    queryKey: ['icp-evaluation', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      const res = await fetch(`/api/icp/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch ICP evaluation')
      const data = (await res.json()) as { evaluation: IcpEvaluation | null }
      return data.evaluation
    },
    enabled: !!sessionId,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  })
}
