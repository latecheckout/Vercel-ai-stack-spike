import { NextResponse } from 'next/server'
import {
  getSession,
  updateSessionMode,
  updateSessionSummary,
  type SessionMode,
} from '@/lib/db/queries/sessions'
import { getMessages } from '@/lib/db/queries/messages'
import { getVisitorFacts } from '@/lib/db/queries/visitor-facts'
import { regenerateFromTranscript } from '@/lib/agent/summary'

/**
 * GET /api/sessions/[sessionId]
 * Returns `{ mode, summary }` for the session — polled by the visitor
 * facts panel so the summary view updates as the workflow rewrites it
 * mid-stream.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const session = await getSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({
      session: { id: session.id, mode: session.mode, summary: session.summary },
    })
  } catch (err) {
    console.error('[GET /api/sessions/[id]]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/sessions/[sessionId]
 * Body: { mode: 'chat' | 'summary' }
 *
 * Flipping into summary mode while there's existing chat history triggers
 * an initial summary regeneration from the transcript — without that, the
 * model would lose all prior context the moment the toggle flipped, which
 * makes the demo feel broken.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const body = (await req.json()) as { mode?: string }

    if (body.mode !== 'chat' && body.mode !== 'summary') {
      return NextResponse.json(
        { error: "mode must be 'chat' or 'summary'" },
        { status: 400 },
      )
    }
    const nextMode = body.mode as SessionMode

    const before = await getSession(sessionId)
    if (!before) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const updated = await updateSessionMode(sessionId, nextMode)

    // Seed the summary on entry to summary mode if we have transcript and
    // no existing summary. Cheap correctness — once a summary exists, the
    // per-turn extension step takes over.
    if (
      nextMode === 'summary' &&
      updated.summary.trim().length === 0
    ) {
      const [messages, facts] = await Promise.all([
        getMessages(sessionId),
        getVisitorFacts(sessionId),
      ])
      if (messages.length > 0) {
        const summary = await regenerateFromTranscript({ messages, facts })
        if (summary.length > 0) {
          const withSummary = await updateSessionSummary(sessionId, summary)
          return NextResponse.json({
            session: {
              id: withSummary.id,
              mode: withSummary.mode,
              summary: withSummary.summary,
            },
          })
        }
      }
    }

    return NextResponse.json({
      session: { id: updated.id, mode: updated.mode, summary: updated.summary },
    })
  } catch (err) {
    console.error('[PATCH /api/sessions/[id]]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
