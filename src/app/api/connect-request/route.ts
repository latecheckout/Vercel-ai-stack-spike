import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/connect-request
 * Body: { sessionId: string, email: string, subject: string, body: string }
 *
 * Triggered by the visitor submitting the inline ConnectRequestCard
 * (rendered from the `offer_lca_connect` tool output). Sends an intro
 * email to Anthony at LCA with the visitor CC'd. The body is plain text
 * with optional markdown — rendered to HTML at send time.
 *
 * No DB persistence on this iteration — the email itself is the record.
 * If/when we want history, extend `email_captures` (add nullable
 * subject/body/recipient columns) or add a sibling `connect_requests`
 * table; both options keep RLS open + anon-friendly for the spike.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LCA_RECIPIENT = 'engineering@latecheckout.studio'
const MAX_SUBJECT = 200
const MAX_BODY = 8000

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sessionId?: string
      email?: string
      subject?: string
      body?: string
    }
    const { sessionId, email, subject, body: emailBody } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'valid email required' }, { status: 400 })
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return NextResponse.json({ error: 'subject required' }, { status: 400 })
    }
    if (!emailBody || typeof emailBody !== 'string' || emailBody.trim().length === 0) {
      return NextResponse.json({ error: 'body required' }, { status: 400 })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanSubject = subject.trim().slice(0, MAX_SUBJECT)
    const cleanBody = emailBody.trim().slice(0, MAX_BODY)

    // Touch auth so we share the same session-id-is-user-id assumption as
    // /api/email-capture. Currently unused beyond that — keeps the door
    // open for tying the send to a user_id if we add persistence later.
    const supabase = await createClient()
    await supabase.auth.getUser()

    await sendConnectEmail({
      visitorEmail: cleanEmail,
      subject: cleanSubject,
      body: cleanBody,
    })

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[POST /api/connect-request]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function sendConnectEmail(input: {
  visitorEmail: string
  subject: string
  body: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? 'LCA <onboarding@resend.dev>'

  if (!apiKey) {
    // Local dev without Resend wired up — log loudly so the omission is
    // visible, but don't 500 (mirrors the email-capture behaviour).
    console.warn(
      '[connect-request] RESEND_API_KEY unset — skipping send. Payload:',
      input,
    )
    return
  }

  // `replyTo` is the visitor's address so when Anthony hits reply the
  // thread goes back to them naturally. The visitor is also `cc`'d so they
  // have a copy in their own inbox.
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: LCA_RECIPIENT,
      cc: [input.visitorEmail],
      reply_to: input.visitorEmail,
      subject: input.subject,
      html: renderBodyHtml(input.body, input.visitorEmail),
      text: input.body,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`)
  }
}

// Minimal markdown → HTML, same idea as the recap renderer in
// `email-capture/route.ts`. Handles bullets, bold, paragraphs.
function renderBodyHtml(text: string, visitorEmail: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const blocks = text.split(/\n{2,}/)
  const html = blocks
    .map((block) => {
      const lines = block.split('\n')
      const isList = lines.every((l) => /^\s*[-*]\s+/.test(l))
      if (isList) {
        const items = lines
          .map((l) => l.replace(/^\s*[-*]\s+/, ''))
          .map((l) => `<li>${formatInline(escape(l))}</li>`)
          .join('')
        return `<ul style="padding-left:20px;margin:0 0 12px">${items}</ul>`
      }
      return `<p style="margin:0 0 12px">${formatInline(escape(block)).replace(/\n/g, '<br>')}</p>`
    })
    .join('')

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;line-height:1.55;font-size:15px">
${html}
<hr style="border:none;border-top:1px solid #eee;margin:20px 0">
<p style="margin:0;font-size:12px;color:#888">Sent from the LCA chatbot on behalf of ${escape(visitorEmail)}.</p>
</div></body></html>`
}

function formatInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
