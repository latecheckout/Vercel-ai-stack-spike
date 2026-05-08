import { generateText } from 'ai'
import { NextResponse } from 'next/server'
import { saveEmailCapture } from '@/lib/db/queries/email-captures'
import { getMessages } from '@/lib/db/queries/messages'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/email-capture
 * Body: { sessionId: string, email: string }
 *
 * End-of-conversation capture. Pulls the session's transcript from Postgres,
 * asks Claude (via the Vercel AI Gateway) to summarise it, persists
 * { email, summary, session_id, user_id } to email_captures, then sends the
 * recap to the visitor via Resend.
 *
 * The summary is generated server-side at submit time so we don't burn
 * tokens on visitors who never opt in. The visitor's auth user id is read
 * from the Supabase cookie — the anonymous-auth flow on the client
 * guarantees one is present by the time the chat is usable.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sessionId?: string; email?: string }
    const { sessionId, email } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: 'valid email required' }, { status: 400 })
    }

    const cleanEmail = email.trim().toLowerCase()

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const messages = await getMessages(sessionId)
    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'No conversation found for this session' },
        { status: 400 },
      )
    }

    const summary = await summariseConversation(messages)

    // Send the recap before persisting — if Resend rejects (bad address,
    // unverified domain, rate-limit), we'd rather show the user an error
    // and let them retry than save a row for an email that never went out.
    await sendRecapEmail({ to: cleanEmail, summary })

    const capture = await saveEmailCapture({
      sessionId,
      userId: user?.id ?? null,
      email: cleanEmail,
      summary,
    })

    return NextResponse.json({ capture })
  } catch (err) {
    console.error('[POST /api/email-capture]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function summariseConversation(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'Visitor' : 'LCA'}: ${m.content}`)
    .join('\n\n')

  const { text } = await generateText({
    model: 'anthropic/claude-sonnet-4.5',
    system:
      'You write a tight, friendly recap of a chat between a visitor and the ' +
      'LCA chatbot. Address the visitor in second person ("you mentioned…"). ' +
      'Cover: what they shared about themselves and their work, what LCA topics ' +
      'they explored, and any concrete next step that came up. Markdown allowed; ' +
      'aim for 4–8 short bullets, no preamble.',
    prompt: `Conversation transcript:\n\n${transcript}\n\nWrite the recap now.`,
  })

  return text.trim()
}

async function sendRecapEmail(input: { to: string; summary: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL ?? 'LCA <onboarding@resend.dev>'

  if (!apiKey) {
    // Local dev without Resend wired up — let the row save but log loudly so
    // the omission is visible.
    console.warn('[email-capture] RESEND_API_KEY unset — skipping email send')
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: 'Your LCA chat recap',
      html: renderRecapHtml(input.summary),
      text: input.summary,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`)
  }
}

// Tiny markdown → HTML so the recap reads well in mail clients without
// pulling in a full markdown lib. Handles: bullets (- / *), bold (**…**),
// blank-line paragraph breaks. Anything else falls through as text.
function renderRecapHtml(summary: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const blocks = summary.split(/\n{2,}/)
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
<h1 style="margin:0 0 4px;font-size:18px">Your LCA chat recap</h1>
<p style="margin:0 0 16px;color:#666;font-size:13px">Here's what we covered.</p>
${html}
<hr style="border:none;border-top:1px solid #eee;margin:20px 0">
<p style="margin:0;font-size:13px;color:#666">Want to keep this conversation? <a href="https://latecheckout.agency" style="color:#0066ff">Sign up</a>.</p>
</div></body></html>`
}

function formatInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
