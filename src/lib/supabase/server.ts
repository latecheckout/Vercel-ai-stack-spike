import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

/**
 * Server-side client for Server Components, Server Actions, API routes,
 * and Workflow steps. Uses the anon key so RLS policies are enforced
 * (the spike's RLS is fully open to anon, so functionally everything
 * goes through; once we add real per-session scoping the key choice
 * becomes load-bearing).
 *
 * The cookies adapter is here for forward-compat with auth flows even
 * though the spike has none — `@supabase/ssr` requires it to be present.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Components cannot set cookies. The proxy handles
            // session refresh — we don't have one yet.
          }
        },
      },
    },
  )
}
