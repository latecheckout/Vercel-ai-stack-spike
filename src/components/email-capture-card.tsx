'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Mail, ArrowUpRight, Check } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmailCaptureCardProps {
  sessionId: string
  onSubmitted: () => void
  onDismiss: () => void
}

/**
 * Inline assistant-style card shown after the visitor has been idle for a
 * while. Pitches: "drop your email, get a recap, and here's a sign-up CTA."
 * Lives inside the chat scroll column so it reads as a continuation of the
 * conversation rather than an interruption.
 *
 * On submit, POSTs to /api/email-capture which generates the summary
 * server-side and persists { email, summary } against the session.
 */
export function EmailCaptureCard({
  sessionId,
  onSubmitted,
  onDismiss,
}: EmailCaptureCardProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || status === 'submitting') return

    setStatus('submitting')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/email-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email: email.trim() }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setStatus('success')
      onSubmitted()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  if (status === 'success') {
    return <SuccessCard />
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <span className="px-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        LCA
      </span>

      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border bg-muted px-4 py-3 shadow-sm">
        <div className="mb-3 flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-snug">
              Looks like you&apos;re wrapping up — want a recap?
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Drop your email and I&apos;ll send a tight summary of what we
              covered. You can also create an account to keep this conversation.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'submitting'}
            required
            className={cn(
              'h-9 w-full rounded-md border border-input bg-background px-3 text-sm',
              'shadow-sm placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          />

          {errorMsg && (
            <p className="text-[11px] text-destructive">{errorMsg}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!email.trim() || status === 'submitting'}
              className="gap-1.5"
            >
              {status === 'submitting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Send me the recap
            </Button>

            {/* Placeholder destination — point this at the real sign-up
                page once one exists. The CTA is the explicit ask in the
                product brief; the recap email is the carrot. */}
            <a
              href="https://latecheckout.agency"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'gap-1.5',
              )}
            >
              Sign up
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              disabled={status === 'submitting'}
              className="ml-auto text-muted-foreground"
            >
              Not yet
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SuccessCard() {
  return (
    <div className="flex flex-col gap-1 items-start">
      <span className="px-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        LCA
      </span>

      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border bg-muted px-4 py-3 shadow-sm">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-snug">
              Got it — recap is on its way.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Want to keep this conversation across devices? Create an account.
            </p>
            <a
              href="https://latecheckout.agency"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5 w-fit')}
            >
              Sign up
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
