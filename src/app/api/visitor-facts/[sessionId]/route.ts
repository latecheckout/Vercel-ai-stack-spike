import {
  getVisitorFacts,
  deleteVisitorFact,
} from '@/lib/db/queries/visitor-facts'
import { NextResponse } from 'next/server'

/**
 * GET /api/visitor-facts/[sessionId]
 * Returns all visitor facts for this session. Polled by the facts panel.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const facts = await getVisitorFacts(sessionId)
    return NextResponse.json({ facts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/visitor-facts/[sessionId]
 * Body: { factId: string }
 * Lets the visitor remove a fact from their profile.
 */
export async function DELETE(
  req: Request,
  { params: _params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { factId } = (await req.json()) as { factId?: string }
    if (!factId) {
      return NextResponse.json({ error: 'factId required' }, { status: 400 })
    }
    await deleteVisitorFact(factId)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
