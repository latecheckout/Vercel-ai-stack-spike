'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@workflow/ai'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ChatMessages } from '@/components/chat-messages'
import { ChatInput } from '@/components/chat-input'
import { VisitorFactsPanel } from '@/components/visitor-facts-panel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatSession } from '@/hooks/use-chat-session'

// Stable QueryClient for React Query (one per component mount)
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 0 },
    },
  })
}

/**
 * ChatInterface — the root 'use client' component.
 *
 * Layout:
 *   ┌──────────────────────────┬──────────────────┐
 *   │  Chat messages (scroll)  │  Visitor facts   │
 *   │                          │  panel           │
 *   ├──────────────────────────┴──────────────────┤
 *   │  Chat input                                 │
 *   └─────────────────────────────────────────────┘
 *
 * WorkflowChatTransport replaces the default useChat fetch transport.
 * It handles:
 *   - Sending messages to /api/chat with chatId (= sessionId)
 *   - Automatic reconnection to the durable workflow stream if interrupted
 */
export function ChatInterface() {
  const queryClient = useMemo(() => createQueryClient(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ChatInterfaceInner />
    </QueryClientProvider>
  )
}

const RUN_ID_KEY = 'lca_chatbot_active_run_id'

function ChatInterfaceInner() {
  const sessionId = useChatSession()

  // If we're loading mid-stream (e.g. after a refresh while the agent was
  // still talking), useChat picks this up and reconnects via the
  // prepareReconnectToStreamRequest callback below.
  const activeRunId = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return localStorage.getItem(RUN_ID_KEY) ?? undefined
  }, [])

  // WorkflowChatTransport sends { messages } by default — we override
  // prepareSendMessagesRequest so chatId rides along in the body.
  // It also captures the workflow run id from the response header and
  // routes reconnection traffic to /api/chat/[runId]/stream.
  const transport = useMemo(
    () =>
      new WorkflowChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { chatId: id, messages, ...body },
        }),
        onChatSendMessage: (response) => {
          const runId = response.headers.get('x-workflow-run-id')
          if (runId) localStorage.setItem(RUN_ID_KEY, runId)
        },
        onChatEnd: () => {
          localStorage.removeItem(RUN_ID_KEY)
        },
        prepareReconnectToStreamRequest: ({ api: _api, ...rest }) => {
          const runId = localStorage.getItem(RUN_ID_KEY)
          if (!runId) throw new Error('No active workflow run id to reconnect to')
          return {
            ...rest,
            api: `/api/chat/${encodeURIComponent(runId)}/stream`,
          }
        },
      }),
    [],
  )

  const { messages, sendMessage, status } = useChat({
    // id becomes the chatId sent by WorkflowChatTransport
    id: sessionId ?? undefined,
    transport,
    resume: Boolean(activeRunId),
  })

  // v6 useChat no longer manages input state — own it locally.
  const [input, setInput] = useState('')

  const isStreaming = status === 'streaming' || status === 'submitted'

  const handleSubmit = () => {
    if (!input.trim() || isStreaming || !sessionId) return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div className="flex h-full">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1">
          <ChatMessages messages={messages} isStreaming={isStreaming} />
        </ScrollArea>

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          isDisabled={isStreaming || !sessionId}
        />
      </div>

      {/* Visitor facts sidebar */}
      <div className="hidden w-72 shrink-0 lg:flex lg:flex-col">
        <VisitorFactsPanel sessionId={sessionId} />
      </div>
    </div>
  )
}
