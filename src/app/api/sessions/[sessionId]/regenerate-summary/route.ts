import { NextResponse } from 'next/server'
import { getSession, updateSessionSummary } from '@/lib/db/queries/sessions'
import { getVisitorFacts } from '@/lib/db/queries/visitor-facts'
import { getMessages } from '@/lib/db/queries/messages'
import {
  pruneSummary,
  regenerateFromTranscript,
} from '@/lib/agent/summary'

/**
 * POST /api/sessions/[sessionId]/regenerate-summary
 * Body: { removedFact?: string }
 *
 * Mode 2's answer to a fact deletion. Two paths:
 *   - If a summary already exists, prune the deleted fact out of it.
 *   - Otherwise, build a fresh summary from the transcript + remaining
 *     facts (covers the edge case where the visitor deleted a fact before
 *     the first summary-mode turn ever ran).
 *
 * The deletion of the fact itself happens via the visitor-facts DELETE
 * endpoint; this endpoint runs *after* that delete so the facts list is
 * already the post-deletion state.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const body = (await req.json().catch(() => ({}))) as { removedFact?: string }

    const session = await getSession(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const facts = await getVisitorFacts(sessionId)

    let nextSummary: string
    if (session.summary.trim().length > 0 && body.removedFact) {
      nextSummary = await pruneSummary({
        previousSummary: session.summary,
        removedFact: body.removedFact,
        facts,
      })
    } else {
      const messages = await getMessages(sessionId)
      nextSummary = await regenerateFromTranscript({ messages, facts })
    }

    const updated = await updateSessionSummary(sessionId, nextSummary)
    return NextResponse.json({
      session: { id: updated.id, mode: updated.mode, summary: updated.summary },
    })
  } catch (err) {
    console.error('[POST /api/sessions/[id]/regenerate-summary]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
