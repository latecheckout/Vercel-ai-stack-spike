import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/database.types'

/**
 * Refresh the Supabase auth cookie on every request so SSR (Server Components,
 * route handlers) sees an up-to-date JWT. The chatbot uses anonymous sign-ins
 * (`supabase.auth.signInAnonymously()`) — these still produce a real auth
 * session, just with `is_anonymous = true`. Without this proxy, the anon
 * session can drift and `getUser()` returns null on the server even when the
 * client thinks it's signed in.
 *
 * No path-based redirects: the spike has no protected routes — we only use
 * `proxy.ts` for cookie refresh.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Touch getUser() so @supabase/ssr decides whether to rotate the JWT and
  // write fresh cookies. We don't actually use the user here.
  await supabase.auth.getUser()

  return supabaseResponse
}
