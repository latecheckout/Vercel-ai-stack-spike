/**
 * Resumable-stream reconnection endpoint.
 *
 * WorkflowChatTransport hits this when the original /api/chat stream is
 * interrupted (network blip, page refresh, function timeout). We resolve
 * the existing workflow run and replay its persisted stream from the
 * client's last known chunk index.
 */

import { createUIMessageStreamResponse } from 'ai'
import type { UIMessageChunk } from 'ai'
import { getRun } from 'workflow/api'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const { searchParams } = new URL(request.url)

  const startIndexParam = searchParams.get('startIndex')
  const startIndex = startIndexParam ? Number.parseInt(startIndexParam, 10) : undefined

  const run = getRun(runId)
  const readable = run.getReadable<UIMessageChunk>({ startIndex })

  // Lets the transport resolve negative startIndex values into absolute
  // positions across retries — required for `initialStartIndex < 0`.
  const tailIndex = await readable.getTailIndex()

  return createUIMessageStreamResponse({
    stream: readable,
    headers: {
      'x-workflow-stream-tail-index': String(tailIndex),
    },
  })
}
