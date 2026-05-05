import { upsertSession } from '@/lib/db/queries/sessions'
import { NextResponse } from 'next/server'

/**
 * POST /api/sessions
 * Body: { sessionId: string }
 *
 * Ensures the session row exists in Supabase. Called by the client when the
 * app loads (before the first chat message).
 */
export async function POST(req: Request) {
  try {
    const { sessionId } = (await req.json()) as { sessionId?: string }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const session = await upsertSession(sessionId)
    return NextResponse.json({ session })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
