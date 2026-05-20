'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * Separate QueryClient for the /admin/* surface. The visitor chat surface
 * mounts its own client in chat-interface.tsx; sharing a client would let
 * admin invalidations clobber chat queries that happen to share keys.
 */
export function AdminQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
