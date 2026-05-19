/**
 * Chat API Route — wraps the durable chat workflow.
 *
 * Pattern (WDK v4):
 *   - The workflow itself lives in `src/lib/agent/chat/index.ts`
 *     (`'use workflow'` directive inside the function body). Its durable
 *     step functions live alongside it in `src/lib/agent/chat/steps.ts`.
 *   - This route is a *regular* Next.js handler. It calls `start()` from
 *     `workflow/api` to kick off a workflow run, then returns the run's
 *     readable stream.
 *   - The `x-workflow-run-id` response header lets WorkflowChatTransport
 *     reconnect to an interrupted stream via `/api/chat/[runId]/stream`.
 */

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'
import type { UIMessage, UIMessageChunk } from 'ai'
import { start } from 'workflow/api'
import { runChatWorkflow } from '@/lib/agent/chat'
import { upsertSession } from '@/lib/db/queries/sessions'
import { saveMessage } from '@/lib/db/queries/messages'
import { moderateText, MODERATION_REFUSAL_TEXT } from '@/lib/agent/moderation'

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
  const lastUserText = lastUserMsg
    ? lastUserMsg.parts
        .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join('')
    : ''

  if (lastUserText) {
    await saveMessage(chatId, 'user', lastUserText).catch(() => undefined)
  }

  // Moderate before kicking off the workflow. Omni-moderation is fast
  // (~200–400ms) so a sequential check is cheaper than the race-condition
  // surface of cancelling a partially-streamed agent run. Moderation lives
  // here (route handler) rather than inside the workflow because the flow
  // worker is stripped down (no `fetch`, no `AbortSignal`) — see AGENTS.md.
  const moderation = lastUserText
    ? await moderateText(lastUserText)
    : { flagged: false as const }

  if (moderation.flagged) {
    await saveMessage(chatId, 'assistant', MODERATION_REFUSAL_TEXT).catch(
      () => undefined,
    )
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({
        execute: ({ writer }) => {
          const id = 'moderation-refusal'
          writer.write({ type: 'text-start', id })
          writer.write({ type: 'text-delta', id, delta: MODERATION_REFUSAL_TEXT })
          writer.write({ type: 'text-end', id })
        },
      }),
    })
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
