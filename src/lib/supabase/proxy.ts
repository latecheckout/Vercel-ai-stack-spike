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
 * Also enforces the `/admin/*` gate:
 *   - not signed in            → redirect to /admin/login
 *   - signed in but not an admin (covers anon visitors and unprivileged
 *     email/password users)    → redirect to /admin/no-access
 *
 * `/admin/login`, `/admin/signup`, and `/admin/no-access` are public so the
 * redirect targets don't themselves redirect.
 *
 * Admin status is checked via `public.is_admin()` rather than a JWT claim so
 * there's one source of truth (the `admins` table); see
 * supabase/schemas/006-admins.sql.
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin')) {
    // Pages users can hit without already being an admin.
    const publicAdminPaths = ['/admin/login', '/admin/signup', '/admin/no-access']
    const isPublicAdminPath = publicAdminPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))

    if (!isPublicAdminPath) {
      if (!user) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/login'
        url.searchParams.set('next', pathname)
        return NextResponse.redirect(url)
      }

      // RPC returns boolean; .rpc with no args still typechecks.
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (!isAdmin) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin/no-access'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
