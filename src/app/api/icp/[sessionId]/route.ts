import { NextResponse } from 'next/server'
import { getLatestIcpEvaluation } from '@/lib/db/queries/icp-evaluations'

/**
 * GET /api/icp/[sessionId]
 *
 * Returns the most recent ICP evaluation row for this session, or
 * `{ evaluation: null }` if none have run yet (fresh visitor, or the
 * first evaluation hasn't completed). The panel polls this so the badge
 * updates as soon as a new evaluation lands.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params
    const evaluation = await getLatestIcpEvaluation(sessionId)
    return NextResponse.json({ evaluation })
  } catch (err) {
    console.error('[GET /api/icp/[sessionId]]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
