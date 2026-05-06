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
    // Surface real DB / Supabase errors in the dev terminal — the previous
    // version only echoed `error.message` to the client, leaving the cause
    // invisible when the route 500'd.
    console.error('[POST /api/sessions]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
