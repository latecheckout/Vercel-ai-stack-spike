import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/admin/sign-out-button'

export const metadata = { title: 'No admin access' }

export default async function NoAccessPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-md border border-border/60 bg-card/40 p-6 text-sm">
      <h1 className="text-2xl font-semibold">You&apos;re signed in, but not an admin.</h1>
      <p className="text-muted-foreground">
        {user?.email ? (
          <>
            You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span>.
            Ask an existing admin to grant you access from the /admin/admins page.
          </>
        ) : (
          'Sign in first.'
        )}
      </p>
      <div className="flex items-center gap-3">
        <SignOutButton />
        <Link href="/" className="text-xs text-muted-foreground underline">
          ← Back to visitor chat
        </Link>
      </div>
    </div>
  )
}
