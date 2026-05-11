'use client'

import { useState } from 'react'
import {
  X,
  Building2,
  User,
  Globe,
  Briefcase,
  Tag,
  Loader2,
  MessagesSquare,
  BrainCircuit,
  Sparkles,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useVisitorFacts, useDeleteVisitorFact } from '@/hooks/use-visitor-facts'
import {
  useSessionState,
  useUpdateSessionMode,
  useResetSession,
  useRegenerateSummary,
} from '@/hooks/use-session-state'
import type { VisitorFact } from '@/lib/db/queries/visitor-facts'
import type { SessionMode } from '@/lib/db/queries/sessions'
import { cn } from '@/lib/utils'

const CATEGORY_META: Record<
  VisitorFact['category'],
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  company: { label: 'Company', Icon: Building2 },
  role: { label: 'Role', Icon: User },
  website: { label: 'Website', Icon: Globe },
  project: { label: 'Project', Icon: Briefcase },
  other: { label: 'Other', Icon: Tag },
}

interface VisitorFactsPanelProps {
  sessionId: string | null
  /** Called when a fact is removed in *either* mode so the chat surface
   *  can scrub matching tool-result parts from useChat's message list. */
  onFactDeleted?: (factId: string) => void
  /** Called when a Mode 1 confirm-and-reset fires so the chat surface can
   *  clear its in-memory message list (the server-side reset has already
   *  run by the time this is called). */
  onConversationReset?: () => void
}

export function VisitorFactsPanel({
  sessionId,
  onFactDeleted,
  onConversationReset,
}: VisitorFactsPanelProps) {
  const { data: facts = [], isLoading: factsLoading } = useVisitorFacts(sessionId)
  const { data: sessionState } = useSessionState(sessionId)
  const deleteMutation = useDeleteVisitorFact(sessionId)
  const updateModeMutation = useUpdateSessionMode(sessionId)
  const resetMutation = useResetSession(sessionId)
  const regenerateMutation = useRegenerateSummary(sessionId)

  // Track which fact (if any) is in the "confirm delete" state for Mode 1.
  // We only ever have one pending at a time — clicking ✕ on a different
  // fact cancels the previous prompt.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const mode: SessionMode = sessionState?.mode ?? 'chat'
  const summary = sessionState?.summary ?? ''

  const handleModeChange = (next: SessionMode) => {
    if (next === mode || updateModeMutation.isPending) return
    setPendingDeleteId(null)
    updateModeMutation.mutate(next)
  }

  // Chat mode: clicking ✕ flips the card into a confirm prompt; the actual
  // delete + reset waits for confirmation. Summary mode: delete immediately
  // and kick off summary regeneration in the background.
  const handleDeleteRequest = async (fact: VisitorFact) => {
    if (mode === 'chat') {
      setPendingDeleteId(fact.id)
      return
    }
    try {
      await deleteMutation.mutateAsync(fact.id)
      onFactDeleted?.(fact.id)
      regenerateMutation.mutate(fact.fact)
    } catch {
      /* mutation rolls back optimistic removal on error */
    }
  }

  const handleConfirmDelete = async (fact: VisitorFact) => {
    setPendingDeleteId(null)
    try {
      await deleteMutation.mutateAsync(fact.id)
      onFactDeleted?.(fact.id)
      await resetMutation.mutateAsync()
      onConversationReset?.()
    } catch {
      /* error states handled by mutation rollback */
    }
  }

  const handleCancelDelete = () => setPendingDeleteId(null)

  return (
    <div className="flex h-full flex-col border-l bg-muted/30">
      {/* Panel header */}
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          What LCA knows about you
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {mode === 'chat'
            ? 'Removing a fact resets the conversation.'
            : 'Removing a fact rewrites the summary.'}
        </p>

        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Conversation mode"
          className="mt-3 inline-flex w-full rounded-md border bg-background p-0.5"
        >
          <ModeTab
            mode="chat"
            current={mode}
            label="Chat"
            Icon={MessagesSquare}
            onSelect={handleModeChange}
            disabled={updateModeMutation.isPending}
          />
          <ModeTab
            mode="summary"
            current={mode}
            label="Summary"
            Icon={BrainCircuit}
            onSelect={handleModeChange}
            disabled={updateModeMutation.isPending}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4">
          {factsLoading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}

          {!factsLoading && facts.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Nothing yet — start chatting and tell the bot about your company.
              </p>
            </div>
          )}

          {facts.map((fact) => {
            const meta = CATEGORY_META[fact.category]
            const isPendingThisFact = pendingDeleteId === fact.id
            const isDeleting =
              deleteMutation.isPending &&
              deleteMutation.variables === fact.id
            return (
              <FactCard
                key={fact.id}
                fact={fact}
                meta={meta}
                onRequestDelete={() => handleDeleteRequest(fact)}
                onConfirmDelete={() => handleConfirmDelete(fact)}
                onCancelDelete={handleCancelDelete}
                isDeleting={isDeleting}
                pendingConfirm={isPendingThisFact}
              />
            )
          })}

          {mode === 'summary' && (
            <SummarySection
              summary={summary}
              isRegenerating={regenerateMutation.isPending}
            />
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="shrink-0 border-t px-4 py-3">
        <p className="text-[11px] text-muted-foreground">
          {facts.length} fact{facts.length !== 1 ? 's' : ''} ·{' '}
          {mode === 'chat' ? 'chat mode' : 'summary mode'}
        </p>
      </div>
    </div>
  )
}

function ModeTab({
  mode,
  current,
  label,
  Icon,
  onSelect,
  disabled,
}: {
  mode: SessionMode
  current: SessionMode
  label: string
  Icon: React.ComponentType<{ className?: string }>
  onSelect: (next: SessionMode) => void
  disabled: boolean
}) {
  const isActive = current === mode
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => onSelect(mode)}
      disabled={disabled}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

function FactCard({
  fact,
  meta,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  isDeleting,
  pendingConfirm,
}: {
  fact: VisitorFact
  meta: (typeof CATEGORY_META)[keyof typeof CATEGORY_META]
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  isDeleting: boolean
  pendingConfirm: boolean
}) {
  const { Icon } = meta

  if (pendingConfirm) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm shadow-sm">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-amber-700" />
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {meta.label}
          </Badge>
        </div>
        <p className="text-sm leading-snug text-amber-950">{fact.fact}</p>
        <p className="mt-2 text-[11px] leading-snug text-amber-800">
          Removing this in chat mode resets the conversation. Continue?
        </p>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            onClick={onConfirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Remove + reset'
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onCancelDelete}
            disabled={isDeleting}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card p-3 text-sm shadow-sm transition-opacity',
        isDeleting && 'opacity-50',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRequestDelete}
        disabled={isDeleting}
        aria-label="Remove fact"
      >
        <X className="h-3 w-3" />
      </Button>

      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {meta.label}
        </Badge>
      </div>

      <p className="text-sm leading-snug">{fact.fact}</p>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Source: {fact.source}
      </p>
    </div>
  )
}

function SummarySection({
  summary,
  isRegenerating,
}: {
  summary: string
  isRegenerating: boolean
}) {
  return (
    <div className="mt-4 rounded-lg border bg-background p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          What I remember
        </p>
        {isRegenerating && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>

      {summary.trim().length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No summary yet — chat with me and I&apos;ll start building one.
        </p>
      ) : (
        <div className="text-xs leading-relaxed text-foreground/90">
          <Streamdown>{summary}</Streamdown>
        </div>
      )}
    </div>
  )
}
