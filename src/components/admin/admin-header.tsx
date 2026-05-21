'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

type Props = {
  user: { id: string; email: string | null } | null
}

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/knowledge', label: 'Knowledge' },
  { href: '/admin/sessions', label: 'Sessions' },
  { href: '/admin/admins', label: 'Admins' },
  { href: '/admin/playground', label: 'Playground' },
]

export function AdminHeader({ user }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  // Auth pages render the header without the nav so the visual is just a
  // brand strip. The proxy gate means an unauthenticated user never reaches
  // pages that would render the nav.
  const isAuthPage =
    pathname === '/admin/login' ||
    pathname === '/admin/signup' ||
    pathname === '/admin/no-access'

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/admin/login')
    router.refresh()
  }

  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="text-sm font-semibold tracking-tight">
            LCA admin
          </Link>
          {!isAuthPage && user && (
            <nav className="flex items-center gap-1 text-sm">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      'rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground ' +
                      (active ? 'bg-accent text-foreground' : '')
                    }
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>
        {user && !isAuthPage && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate max-w-[12rem]">{user.email}</span>
            <Button size="sm" variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
