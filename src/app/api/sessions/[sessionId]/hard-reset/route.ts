import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/db/queries/sessions'

/**
 * POST /api/sessions/[sessionId]/hard-reset
 *
 * "Start over" path: drops the entire session row. `messages` and
 * `visitor_facts` cascade off `sessions.id`, so this single delete clears
 * the transcript, the rolling summary, and every fact the agent has
 * learned about the visitor in one shot.
 *
 * The client follows up by signing the anonymous user out and signing a
 * fresh one in, so the next message lands in a brand-new session row.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    await deleteSession(sessionId)
    return NextResponse.json({ reset: true })
  } catch (err) {
    console.error('[POST /api/sessions/[id]/hard-reset]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
