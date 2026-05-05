'use workflow'
/**
 * Chat API Route — DurableAgent
 *
 * Marked 'use workflow' so the Workflow DevKit transforms this into a durable
 * function. Each agent turn is persisted; the research_visitor and save_visitor_fact
 * tools are retryable steps ('use step' in their execute functions). If the
 * serverless function restarts mid-turn, the workflow replays from the last
 * completed step rather than starting over.
 *
 * Client side: WorkflowChatTransport (from @workflow/ai) + useChat from @ai-sdk/react.
 * The transport handles automatic reconnection to the durable stream.
 *
 * Model: anthropic/claude-sonnet-4.5 via Vercel AI Gateway.
 * Auth:  AI_GATEWAY_API_KEY env var.
 */

import { DurableAgent } from '@workflow/ai/agent'
import { getWritable } from 'workflow'
import { convertToModelMessages } from 'ai'
import type { UIMessageChunk, UIMessage } from 'ai'
import { AGENT_INSTRUCTIONS } from '@/lib/agent/instructions'
import { retrieveLcaKnowledge } from '@/lib/agent/tools/retrieve-lca-knowledge'
import { researchVisitor } from '@/lib/agent/tools/research-visitor'
import { makeSaveVisitorFactTool } from '@/lib/agent/tools/save-visitor-fact'
import { upsertSession } from '@/lib/db/queries/sessions'
import { saveMessage } from '@/lib/db/queries/messages'

export async function POST(req: Request) {
  // WorkflowChatTransport sends { chatId, messages } by default.
  // chatId == the useChat `id` we initialise with the visitor's session UUID.
  const body = (await req.json()) as { chatId: string; messages: UIMessage[] }
  const { chatId, messages: uiMessages } = body

  if (!chatId) {
    return new Response('Missing chatId', { status: 400 })
  }

  // Ensure the session row exists in Supabase (upsert is idempotent).
  await upsertSession(chatId)

  // Persist the latest user message (last in the array).
  // UIMessage in v6 has `parts` only — concatenate any text parts.
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

  // Convert UIMessages → ModelMessages (AI SDK v6 renamed this and made it async).
  const modelMessages = await convertToModelMessages(uiMessages)

  // Build the DurableAgent. Tools that need the sessionId receive it via closure.
  const agent = new DurableAgent({
    // String form: DurableAgent routes through Vercel AI Gateway automatically.
    // Requires AI_GATEWAY_API_KEY env var.
    model: 'anthropic/claude-sonnet-4.5',
    instructions: AGENT_INSTRUCTIONS,
    tools: {
      retrieve_lca_knowledge: retrieveLcaKnowledge,
      research_visitor: researchVisitor,
      save_visitor_fact: makeSaveVisitorFactTool(chatId),
    },
    onFinish: async ({ text }) => {
      // Persist the final assistant response to Supabase for replay/inspection.
      await saveMessage(chatId, 'assistant', text).catch(() => undefined)
    },
  })

  // getWritable() returns the workflow's output WritableStream.
  // The Workflow DevKit pipes this to the HTTP response automatically.
  // WorkflowChatTransport on the client reads from this stream and handles reconnects.
  await agent.stream({
    messages: modelMessages,
    writable: getWritable<UIMessageChunk>(),
    maxSteps: 12, // cap the tool loop — prevents runaway agents
  })
}
