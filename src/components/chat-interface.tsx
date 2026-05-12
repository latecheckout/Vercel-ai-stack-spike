'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@workflow/ai'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatMessages } from '@/components/chat-messages'
import { ChatInput } from '@/components/chat-input'
import { VisitorFactsPanel } from '@/components/visitor-facts-panel'
import { EmailCaptureCard } from '@/components/email-capture-card'
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

// Time of inactivity (in ms) after which the email-capture card pops up.
// Picked at 5 minutes per the product brief; drop this to ~60s locally
// when you're iterating on the card UX.
const EMAIL_CAPTURE_IDLE_MS = 5 * 60 * 1000

// Minimum messages before we even consider showing the card — we want at
// least one back-and-forth so the recap has substance.
const EMAIL_CAPTURE_MIN_MESSAGES = 2

type CaptureState = 'hidden' | 'shown' | 'submitted' | 'dismissed'

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

  const { messages, sendMessage, setMessages, status } = useChat({
    // id becomes the chatId sent by WorkflowChatTransport
    id: sessionId ?? undefined,
    transport,
    resume: Boolean(activeRunId),
  })

  // v6 useChat no longer manages input state — own it locally.
  const [input, setInput] = useState('')

  const isStreaming = status === 'streaming' || status === 'submitted'

  // ─── Email-capture inactivity detection ─────────────────────────────────
  //
  // After EMAIL_CAPTURE_IDLE_MS without a new message (and once we have a
  // real conversation going), surface the recap+CTA card. Once the visitor
  // submits, dismisses, or sends a new message, we don't pop it again for
  // the rest of the session — re-prompting feels naggy.
  const [captureState, setCaptureState] = useState<CaptureState>('hidden')
  const messageCount = messages.length

  // Detect "new message arrived while card was shown" by comparing the
  // current message count to whatever we last saw. We can't fold this into
  // the timer effect: that one has captureState in its deps, and a transition
  // hidden → shown would re-run it and instantly dismiss the freshly-opened
  // card before the user ever sees it.
  const prevMessageCountRef = useRef(messageCount)
  useEffect(() => {
    const prev = prevMessageCountRef.current
    prevMessageCountRef.current = messageCount
    if (captureState === 'shown' && messageCount > prev) {
      setCaptureState('dismissed')
    }
  }, [messageCount, captureState])

  useEffect(() => {
    if (
      captureState !== 'hidden' ||
      messageCount < EMAIL_CAPTURE_MIN_MESSAGES ||
      isStreaming
    ) {
      return
    }

    const timer = setTimeout(() => {
      setCaptureState('shown')
    }, EMAIL_CAPTURE_IDLE_MS)

    return () => clearTimeout(timer)
  }, [messageCount, isStreaming, captureState])

  const handleEmailSubmitted = useCallback(() => {
    setCaptureState('submitted')
  }, [])

  const handleEmailDismissed = useCallback(() => {
    setCaptureState('dismissed')
  }, [])

  const handleSubmit = () => {
    if (!input.trim() || isStreaming || !sessionId) return
    sendMessage({ text: input })
    setInput('')
  }

  // When the visitor deletes a fact from the panel, scrub the matching
  // `save_visitor_fact` tool result from useChat's message state. Without
  // this, convertToModelMessages on the next turn would still hand the model
  // the original structured tool call, and it would keep referencing the
  // deleted fact. The system prompt also reloads facts every turn — that's
  // the backstop for any assistant prose that mentioned the fact.
  const handleFactDeleted = useCallback(
    (factId: string) => {
      setMessages((prev) =>
        prev
          .map((msg) => ({
            ...msg,
            parts: msg.parts.filter((part) => {
              if (part.type !== 'tool-save_visitor_fact') return true
              if (
                'output' in part &&
                part.output &&
                typeof part.output === 'object' &&
                'id' in part.output &&
                (part.output as { id?: unknown }).id === factId
              ) {
                return false
              }
              return true
            }),
          }))
          .filter((msg) => msg.parts.length > 0),
      )
    },
    [setMessages],
  )

  const showCapture = captureState === 'shown' || captureState === 'submitted'

  return (
    <div className="flex h-full">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1">
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            footer={
              showCapture && sessionId ? (
                <EmailCaptureCard
                  sessionId={sessionId}
                  onSubmitted={handleEmailSubmitted}
                  onDismiss={handleEmailDismissed}
                />
              ) : null
            }
          />
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
        <VisitorFactsPanel sessionId={sessionId} onFactDeleted={handleFactDeleted} />
      </div>
    </div>
  )
}
