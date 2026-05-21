import Link from 'next/link'
import { AdminQueryProvider } from '@/components/admin/admin-query-provider'
import { AdminHeader } from '@/components/admin/admin-header'
import { createClient } from '@/lib/supabase/server'

/**
 * Layout for every /admin/* page. The proxy (src/lib/supabase/proxy.ts)
 * already ensures only admins reach the nested pages — the only paths
 * served unauthenticated are /admin/login, /admin/signup, /admin/no-access,
 * which render the header without the nav links by inspecting the user.
 *
 * We mount our own QueryClient here (separate from the chat surface's
 * QueryClient in chat-interface.tsx) so admin mutations don't share cache
 * keys with visitor-facing queries.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <AdminQueryProvider>
      <div className="min-h-screen bg-background text-foreground">
        <AdminHeader user={user ? { id: user.id, email: user.email ?? null } : null} />
        <main className="mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            ← Back to visitor chat
          </Link>
        </footer>
      </div>
    </AdminQueryProvider>
  )
}
