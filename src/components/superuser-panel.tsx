'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { IcpFitCard } from '@/components/icp-fit-card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

type SuperuserPanelContextValue = {
  open: boolean
  toggle: () => void
}

const SuperuserPanelContext = createContext<SuperuserPanelContextValue | null>(null)

function useSuperuserPanelContext(): SuperuserPanelContextValue {
  const ctx = useContext(SuperuserPanelContext)
  if (!ctx) {
    throw new Error('SuperuserPanel components must be used inside <SuperuserPanelProvider>')
  }
  return ctx
}

/**
 * Wraps any subtree that needs to read or toggle the superuser panel. We
 * use a context (rather than prop drilling) because the toggle button
 * lives in the page header while the panel itself lives in the chat
 * interface — they only share state, not parent component.
 */
export function SuperuserPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((prev) => !prev), [])

  const value = useMemo<SuperuserPanelContextValue>(
    () => ({ open, toggle }),
    [open, toggle],
  )

  return (
    <SuperuserPanelContext.Provider value={value}>{children}</SuperuserPanelContext.Provider>
  )
}

/**
 * Header-mounted icon button that opens/closes the superuser side panel.
 * Always rendered — the shield icon is the signal that the drawer is an
 * internal/dev surface, not a visitor-facing feature.
 */
export function SuperuserToggleButton() {
  const { open, toggle } = useSuperuserPanelContext()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={open}
      aria-label={open ? 'Close superuser panel' : 'Open superuser panel'}
      title="Superuser panel"
      className={cn(
        'text-muted-foreground hover:text-foreground',
        open && 'bg-muted text-foreground',
      )}
    >
      <ShieldCheck className="h-4 w-4" />
    </Button>
  )
}

/**
 * Left-side drawer for internal/dev tooling — currently the ICP-fit card.
 * Visible only when the toggle button has been activated. The ICP polling
 * hook is only mounted while the drawer is actually open, so closed-state
 * has no network cost.
 */
export function SuperuserPanel({ sessionId }: { sessionId: string | null }) {
  const { open } = useSuperuserPanelContext()
  if (!open || !sessionId) return null

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-muted/30">
      <ScrollArea className="flex-1">
        <IcpFitCard sessionId={sessionId} />
      </ScrollArea>
    </div>
  )
}
