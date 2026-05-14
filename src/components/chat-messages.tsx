'use client'

import { useEffect, useRef } from 'react'
import { isToolUIPart, getToolName, type UIMessage } from 'ai'
import { Loader2, Search, BookOpen, Database, UserRound, Globe } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'
import {
  ConnectRequestCard,
  type ConnectDraft,
} from '@/components/connect-request-card'

// Tool call display metadata. `getLabel` receives `part.input` (which may be
// partial during input-streaming) and returns the pending label including the
// trailing ellipsis — the render swaps that for ' ✓' once the call completes.
const TOOL_META: Record<string, {
  Icon: React.ComponentType<{ className?: string }>
  getLabel: (input: unknown) => string
}> = {
  retrieve_lca_knowledge: {
    Icon: BookOpen,
    getLabel: () => 'Checking LCA knowledge base…',
  },
  save_visitor_fact: {
    Icon: Database,
    getLabel: () => 'Saving fact…',
  },
  offer_lca_connect: {
    Icon: UserRound,
    getLabel: () => 'Drafting an intro…',
  },
  search_web: {
    Icon: Search,
    getLabel: (input) => {
      const query = (input as { query?: string } | null)?.query
      return query ? `Searching for "${query}"…` : 'Searching the web…'
    },
  },
  fetch_website: {
    Icon: Globe,
    getLabel: (input) => {
      const url = (input as { url?: string } | null)?.url
      const host = safeHostname(url)
      return host ? `Reading ${host}…` : 'Reading website…'
    },
  },
}

function safeHostname(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

interface ChatMessagesProps {
  messages: UIMessage[]
  isStreaming: boolean
  /** Session id — needed so inline tool-cards (e.g. ConnectRequestCard)
   *  can POST to their endpoints. */
  sessionId: string | null
  /** Optional inline element rendered after the last message — used for the
   *  end-of-conversation email capture card so it scrolls with the chat. */
  footer?: React.ReactNode
}

export function ChatMessages({
  messages,
  isStreaming,
  sessionId,
  footer,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom as messages arrive — and when the footer slot
  // appears, so the email-capture card lands in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming, footer])

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-2xl">👋</div>
        <p className="max-w-xs text-sm text-muted-foreground">
          Hi — I'm the LCA chatbot. Tell me about what you're building and I'll tell you
          whether LCA can help.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} sessionId={sessionId} />
      ))}

      {/* Streaming indicator — shown between last message and the bottom */}
      {isStreaming && (
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>LCA is thinking…</span>
        </div>
      )}

      {footer}

      <div ref={bottomRef} />
    </div>
  )
}

function MessageBubble({
  message,
  sessionId,
}: {
  message: UIMessage
  sessionId: string | null
}) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      {/* Role label */}
      <span className="px-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {isUser ? 'You' : 'LCA'}
      </span>

      {/* Message parts */}
      <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start', 'max-w-[85%]')}>
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <div
                key={i}
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  isUser
                    ? 'bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap'
                    : 'bg-muted rounded-bl-sm',
                )}
              >
                {isUser ? part.text : <Streamdown>{part.text}</Streamdown>}
              </div>
            )
          }

          // Tool call indicator — shows what the agent is doing.
          // v6: tool parts are typed as `tool-${name}` (or `dynamic-tool`) with a
          // `state` of input-streaming | input-available | output-available | output-error.
          if (isToolUIPart(part)) {
            const toolName = getToolName(part)

            // offer_lca_connect is special — once the draft is available
            // we render the full inline form instead of a status pill.
            // While the tool is still running we fall through to the
            // generic chip below ("Drafting an intro…").
            if (
              toolName === 'offer_lca_connect' &&
              part.state === 'output-available' &&
              sessionId
            ) {
              const draft = (part.output ?? {}) as ConnectDraft
              return (
                <div key={i} className="w-full">
                  <ConnectRequestCard sessionId={sessionId} draft={draft} />
                </div>
              )
            }

            const meta = TOOL_META[toolName]
            if (!meta) return null

            const { Icon, getLabel } = meta
            const isPending =
              part.state === 'input-streaming' || part.state === 'input-available'
            const label = getLabel(part.input)

            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : (
                  <Icon className="h-3 w-3 text-muted-foreground" />
                )}
                <span>{isPending ? label : label.replace('…', ' ✓')}</span>
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
