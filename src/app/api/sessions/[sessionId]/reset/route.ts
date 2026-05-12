import { NextResponse } from 'next/server'
import { clearMessages } from '@/lib/db/queries/messages'
import { updateSessionSummary } from '@/lib/db/queries/sessions'

/**
 * POST /api/sessions/[sessionId]/reset
 *
 * Wipes the session's transcript and rolling summary. Triggered by the
 * Mode 1 "confirm and reset" flow after the visitor deletes a fact —
 * because Mode 1 sends the full message history every turn, deleting a
 * fact without scrubbing history leaves stale references in past tool
 * calls and assistant prose. The reset is the honest fix.
 *
 * The client clears its own useChat state separately. We don't drop
 * visitor_facts here — the visitor has only asked to remove one fact,
 * not start over completely.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    await Promise.all([
      clearMessages(sessionId),
      updateSessionSummary(sessionId, ''),
    ])
    return NextResponse.json({ reset: true })
  } catch (err) {
    console.error('[POST /api/sessions/[id]/reset]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
