'use client'

import { useChat } from '@ai-sdk/react'
import { WorkflowChatTransport } from '@workflow/ai'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UIMessage } from 'ai'
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

const INTRO_MESSAGE =
  "I'm here to learn about what LCA can do for you. Can I ask what your role is and what brought you to LCA today?"

function buildIntroMessage(): UIMessage {
  return {
    id: `intro-${crypto.randomUUID()}`,
    role: 'assistant',
    parts: [{ type: 'text', text: INTRO_MESSAGE }],
  }
}

const INTRO_SUGGESTIONS = [
  'Tell me about LCA',
  'What services does LCA provide?',
  'Tell me about recent projects from LCA',
] as const

function IntroSuggestions({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2 px-2">
      {INTRO_SUGGESTIONS.map((text) => (
        <button
          key={text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(text)}
          className="rounded-full border bg-card px-3 py-1.5 text-xs text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// Time of inactivity (in ms) after which the email-capture card pops up.
// Picked at 5 minutes per the product brief; drop this to ~60s locally
// when you're iterating on the card UX.
const EMAIL_CAPTURE_IDLE_MS = 5 * 60 * 1000

// Minimum messages before we even consider showing the card — we want at
// least one back-and-forth so the recap has substance.
const EMAIL_CAPTURE_MIN_MESSAGES = 2

type CaptureState = 'hidden' | 'shown' | 'submitted' | 'dismissed'

function ChatInterfaceInner() {
  const { sessionId, resetSession } = useChatSession()

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

  // Canned intro: once auth has resolved and the chat is empty (fresh visitor
  // or post-reset), drop a synthetic assistant turn so the bot opens the
  // conversation instead of waiting. Skipped on resume so we don't prepend
  // an extra bubble in front of an in-flight stream.
  useEffect(() => {
    if (!sessionId || activeRunId || messages.length > 0) return
    setMessages([buildIntroMessage()])
  }, [sessionId, activeRunId, messages.length, setMessages])

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

  const handleSuggestionPick = useCallback(
    (text: string) => {
      if (isStreaming || !sessionId) return
      sendMessage({ text })
    },
    [isStreaming, sessionId, sendMessage],
  )

  // Show the canned first-message pills only while the chat contains
  // nothing but the intro turn — once the visitor sends anything (or the
  // model is responding), they disappear and don't come back.
  const showSuggestions =
    !!sessionId &&
    !isStreaming &&
    messages.length === 1 &&
    messages[0]?.role === 'assistant'

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

  // Chat-mode confirm-and-reset path: by the time this fires, the server
  // has already cleared `messages` + `summary` for the session. We just
  // need to drop the local useChat state so the visitor sees the empty
  // chat surface — preserves the visitor_facts list (only one fact was
  // removed) and re-opens the conversation from a clean slate.
  const handleConversationReset = useCallback(() => {
    setMessages([])
    localStorage.removeItem(RUN_ID_KEY)
  }, [setMessages])

  // "Start over" path: by the time this fires the server has dropped the
  // entire session row (facts + transcript + summary cascaded off). We
  // wipe the local chat surface, drop any in-flight run id, reset the
  // email-capture timer, and rotate the anonymous auth user so the next
  // message lands in a brand-new session id.
  const handleHardReset = useCallback(async () => {
    setMessages([])
    localStorage.removeItem(RUN_ID_KEY)
    setCaptureState('hidden')
    prevMessageCountRef.current = 0
    await resetSession()
  }, [setMessages, resetSession])

  const showCapture = captureState === 'shown' || captureState === 'submitted'

  return (
    <div className="flex h-full">
      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ScrollArea className="flex-1">
          <ChatMessages
            messages={messages}
            isStreaming={isStreaming}
            sessionId={sessionId}
            footer={
              showCapture && sessionId ? (
                <EmailCaptureCard
                  sessionId={sessionId}
                  onSubmitted={handleEmailSubmitted}
                  onDismiss={handleEmailDismissed}
                />
              ) : showSuggestions ? (
                <IntroSuggestions
                  onPick={handleSuggestionPick}
                  disabled={isStreaming}
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
        <VisitorFactsPanel
          sessionId={sessionId}
          onFactDeleted={handleFactDeleted}
          onConversationReset={handleConversationReset}
          onHardReset={handleHardReset}
        />
      </div>
    </div>
  )
}
