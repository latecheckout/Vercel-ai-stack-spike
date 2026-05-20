'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // If email confirmations are off (the default for local dev) the user
    // is already signed in. Send them to /admin — proxy will bounce to
    // /admin/no-access if they're not yet promoted, which is the expected
    // first-run flow.
    if (data.session) {
      router.replace('/admin')
      router.refresh()
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-md border border-border/60 bg-card/40 p-6 text-sm">
        <p>Check your email for a confirmation link, then come back and sign in.</p>
        <Link href="/admin/login" className="underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-border/60 bg-card/40 p-6">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Creating…' : 'Create account'}
      </Button>
      <p className="text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href="/admin/login" className="underline hover:no-underline">
          Sign in
        </Link>
        .
      </p>
    </form>
  )
}
