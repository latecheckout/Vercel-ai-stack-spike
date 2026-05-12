'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Send, Check, X, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface ConnectDraft {
  ready: boolean
  recipient?: string
  subject?: string
  body?: string
  error?: string
}

interface ConnectRequestCardProps {
  sessionId: string
  draft: ConnectDraft
}

/**
 * Inline assistant-style card rendered from an `offer_lca_connect` tool
 * call. Shows the LLM-drafted subject + body (both editable), takes the
 * visitor's email, and POSTs to /api/connect-request on submit.
 *
 * Lives inside the chat scroll column so it reads as a continuation of
 * the conversation rather than an interruption. Submission state is
 * local — if the visitor refreshes mid-form they'll see it empty again,
 * which is fine for the spike. Once they hit send, it locks into a
 * success bubble and won't pop again because the tool's output part has
 * already been consumed.
 */
export function ConnectRequestCard({ sessionId, draft }: ConnectRequestCardProps) {
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [body, setBody] = useState(draft.body ?? '')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'dismissed' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!draft.ready) {
    return (
      <CardShell tone="muted">
        <p className="text-xs text-muted-foreground">
          Couldn&apos;t put a draft together right now
          {draft.error ? ` — ${draft.error}` : ''}.
        </p>
      </CardShell>
    )
  }

  if (status === 'dismissed') {
    return (
      <CardShell tone="muted">
        <p className="text-xs text-muted-foreground">
          No worries — say the word if you change your mind.
        </p>
      </CardShell>
    )
  }

  if (status === 'success') {
    return (
      <CardShell tone="success">
        <div className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-snug">
              Sent — Anthony has it, you&apos;re CC&apos;d.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Reply to the email in your inbox once it lands and the thread
              goes straight to Anthony.
            </p>
          </div>
        </div>
      </CardShell>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (
      !email.trim() ||
      !subject.trim() ||
      !body.trim() ||
      status === 'submitting'
    ) {
      return
    }

    setStatus('submitting')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/connect-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          email: email.trim(),
          subject: subject.trim(),
          body: body.trim(),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <CardShell>
      <div className="mb-3 flex items-start gap-2">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-snug">
            Want me to put you in touch with Anthony at LCA?
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            I drafted an intro you can edit. Add your email and I&apos;ll send
            it to Anthony — you&apos;ll be CC&apos;d so replies come straight
            to your inbox.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Your email
          </span>
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
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={status === 'submitting'}
            required
            className={cn(
              'h-9 w-full rounded-md border border-input bg-background px-3 text-sm',
              'shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Message
          </span>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={status === 'submitting'}
            required
            rows={8}
            className="min-h-[140px] resize-y bg-background text-sm leading-relaxed"
          />
          <span className="px-0.5 text-[10px] text-muted-foreground">
            To: {draft.recipient} · CC: {email.trim() || 'you'}
          </span>
        </label>

        {errorMsg && (
          <p className="text-[11px] text-destructive">{errorMsg}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={
              !email.trim() ||
              !subject.trim() ||
              !body.trim() ||
              status === 'submitting'
            }
            className="gap-1.5"
          >
            {status === 'submitting' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Send to Anthony
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStatus('dismissed')}
            disabled={status === 'submitting'}
            className="ml-auto gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Not now
          </Button>
        </div>
      </form>
    </CardShell>
  )
}

function CardShell({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'muted' | 'success'
}) {
  return (
    <div className="flex w-full flex-col gap-1 items-start">
      <span className="px-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        LCA
      </span>
      <div
        className={cn(
          'w-full max-w-[560px] rounded-2xl rounded-bl-sm border px-4 py-3 shadow-sm',
          tone === 'success'
            ? 'border-emerald-200 bg-emerald-50'
            : tone === 'muted'
              ? 'bg-muted/60'
              : 'bg-muted',
        )}
      >
        {children}
      </div>
    </div>
  )
}
