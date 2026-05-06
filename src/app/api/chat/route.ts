/**
 * Chat API Route — wraps the durable chat workflow.
 *
 * Pattern (WDK v4):
 *   - The workflow itself lives in `src/lib/agent/chat-workflow.ts`
 *     (`'use workflow'` directive inside the function body).
 *   - This route is a *regular* Next.js handler. It calls `start()` from
 *     `workflow/api` to kick off a workflow run, then returns the run's
 *     readable stream.
 *   - The `x-workflow-run-id` response header lets WorkflowChatTransport
 *     reconnect to an interrupted stream via `/api/chat/[runId]/stream`.
 */

import { convertToModelMessages, createUIMessageStreamResponse } from 'ai'
import type { UIMessage, UIMessageChunk } from 'ai'
import { start } from 'workflow/api'
import { runChatWorkflow } from '@/lib/agent/chat-workflow'
import { upsertSession } from '@/lib/db/queries/sessions'
import { saveMessage } from '@/lib/db/queries/messages'

export async function POST(req: Request) {
  const body = (await req.json()) as { chatId: string; messages: UIMessage[] }
  const { chatId, messages: uiMessages } = body

  if (!chatId) {
    return new Response('Missing chatId', { status: 400 })
  }

  // Persist session + latest user message at the request boundary. These
  // are not durable (the workflow is) — that's deliberate: re-running
  // the same POST after a transient failure should not double-persist.
  await upsertSession(chatId)

  const lastUserMsg = [...uiMessages].reverse().find((m) => m.role === 'user')
  if (lastUserMsg) {
    const content = lastUserMsg.parts
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join('')
    if (content) {
      await saveMessage(chatId, 'user', content).catch(() => undefined)
    }
  }

  const modelMessages = await convertToModelMessages(uiMessages)
  const run = await start(runChatWorkflow, [chatId, modelMessages])

  return createUIMessageStreamResponse({
    stream: run.getReadable<UIMessageChunk>(),
    headers: {
      'x-workflow-run-id': run.runId,
    },
  })
}
