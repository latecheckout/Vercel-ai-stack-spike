'use client'

import {
  X,
  Building2,
  User,
  Globe,
  Briefcase,
  Tag,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useVisitorFacts, useDeleteVisitorFact } from '@/hooks/use-visitor-facts'
import type { VisitorFact } from '@/lib/db/queries/visitor-facts'
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
  onFactDeleted?: (factId: string) => void
}

export function VisitorFactsPanel({ sessionId, onFactDeleted }: VisitorFactsPanelProps) {
  const { data: facts = [], isLoading } = useVisitorFacts(sessionId)
  const deleteMutation = useDeleteVisitorFact(sessionId)

  const handleDelete = async (factId: string) => {
    try {
      await deleteMutation.mutateAsync(factId)
      onFactDeleted?.(factId)
    } catch {
      // Mutation handles rollback (panel card reappears via React Query
      // cache restore in onError); intentionally no chat scrub on failure.
    }
  }

  return (
    <div className="flex h-full flex-col border-l bg-muted/30">
      {/* Panel header */}
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          What LCA knows about you
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Click × to remove any fact
        </p>
      </div>

      {/* Facts list */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4">
          {isLoading && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}

          {!isLoading && facts.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Nothing yet — start chatting and tell the bot about your company.
              </p>
            </div>
          )}

          {!isLoading && facts.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-yellow-400 bg-yellow-300 p-2.5 text-black">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="text-[11px] leading-snug">
                Removing a fact may not fully erase it from this conversation —
                the model can still see your earlier messages. Refresh the page
                to start a clean session.
              </p>
            </div>
          )}

          {facts.map((fact) => {
            const meta = CATEGORY_META[fact.category]
            return (
              <FactCard
                key={fact.id}
                fact={fact}
                meta={meta}
                onDelete={() => handleDelete(fact.id)}
                isDeleting={deleteMutation.isPending}
              />
            )
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      {facts.length > 0 && (
        <div className="shrink-0 border-t px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            {facts.length} fact{facts.length !== 1 ? 's' : ''} saved this session
          </p>
        </div>
      )}
    </div>
  )
}

function FactCard({
  fact,
  meta,
  onDelete,
  isDeleting,
}: {
  fact: VisitorFact
  meta: (typeof CATEGORY_META)[keyof typeof CATEGORY_META]
  onDelete: () => void
  isDeleting: boolean
}) {
  const { Icon } = meta

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card p-3 text-sm shadow-sm transition-opacity',
        isDeleting && 'opacity-50',
      )}
    >
      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label="Remove fact"
      >
        <X className="h-3 w-3" />
      </Button>

      {/* Category badge */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {meta.label}
        </Badge>
      </div>

      {/* Fact text */}
      <p className="text-sm leading-snug">{fact.fact}</p>

      {/* Source */}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Source: {fact.source}
      </p>
    </div>
  )
}
