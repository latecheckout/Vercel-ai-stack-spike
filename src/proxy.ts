import { updateSession } from '@/lib/supabase/proxy'
import type { NextRequest } from 'next/server'

/**
 * Next.js 16 renamed `middleware.ts` → `proxy.ts`. This runs on every request
 * (matched below) and refreshes the Supabase auth cookie so anonymous-signed-in
 * visitors keep a fresh JWT in SSR.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Skip Next internals and static assets — only run on dynamic routes
    // and route handlers, where cookie refresh actually matters.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
