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

import { convertToModelMessages, createUIMessageStreamResponse } from 'ai'
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

  // Kick off moderation in parallel with workflow startup. Moderation lives
  // here (route handler) rather than inside the workflow because the flow
  // worker is stripped down (no `fetch`, no `AbortSignal`) — see AGENTS.md.
  // From here we can `run.cancel()` the workflow and gate the readable.
  const moderationPromise = lastUserText
    ? moderateText(lastUserText)
    : Promise.resolve({ flagged: false as const })

  const modelMessages = await convertToModelMessages(uiMessages)
  const run = await start(runChatWorkflow, [chatId, modelMessages])
  const agentReadable = run.getReadable<UIMessageChunk>()

  const gatedStream = gateStreamOnModeration({
    chatId,
    agentReadable,
    moderationPromise,
    cancelRun: () => run.cancel(),
  })

  return createUIMessageStreamResponse({
    stream: gatedStream,
    headers: {
      'x-workflow-run-id': run.runId,
    },
  })
}

/**
 * Forwards agent chunks until moderation flags the user message. On flag:
 *   1. Stop forwarding further agent chunks.
 *   2. Cancel the workflow run + the agent readable (best-effort).
 *   3. Emit a `data-redact` chunk so the client renderer replaces any
 *      partial text already on screen with the refusal.
 *   4. Persist the refusal to DB as the assistant's reply for this turn —
 *      the workflow's own `persistAssistantMessage` step may or may not
 *      fire depending on cancel timing; this is the source of truth.
 */
function gateStreamOnModeration(opts: {
  chatId: string
  agentReadable: ReadableStream<UIMessageChunk>
  moderationPromise: Promise<{ flagged: boolean }>
  cancelRun: () => Promise<unknown>
}): ReadableStream<UIMessageChunk> {
  const { chatId, agentReadable, moderationPromise, cancelRun } = opts

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let flagged = false

      const moderationWatcher = moderationPromise.then(async (result) => {
        if (!result.flagged) return
        flagged = true
        await Promise.allSettled([
          cancelRun(),
          agentReadable.cancel('moderation-flagged'),
        ])
      })

      const reader = agentReadable.getReader()
      try {
        while (true) {
          let chunk: ReadableStreamReadResult<UIMessageChunk>
          try {
            chunk = await reader.read()
          } catch {
            // agentReadable.cancel() above can reject pending reads — treat
            // as end-of-stream so we proceed to the redact emission.
            break
          }
          if (chunk.done) break
          if (flagged) continue
          controller.enqueue(chunk.value)
        }
      } finally {
        reader.releaseLock()
      }

      // Ensure we've awaited the final moderation outcome before deciding
      // whether to redact — the read loop may have exited because the agent
      // finished cleanly before moderation came back.
      await moderationWatcher

      if (flagged) {
        controller.enqueue({
          type: 'data-redact',
          data: { text: MODERATION_REFUSAL_TEXT },
          transient: false,
        } as UIMessageChunk)
        controller.enqueue({ type: 'finish' } as UIMessageChunk)
        await saveMessage(chatId, 'assistant', MODERATION_REFUSAL_TEXT).catch(
          () => undefined,
        )
      }

      controller.close()
    },
    cancel(reason) {
      agentReadable.cancel(reason).catch(() => undefined)
    },
  })
}
