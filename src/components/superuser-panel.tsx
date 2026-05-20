'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { IcpFitCard } from '@/components/icp-fit-card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// Hidden by default — the panel is for internal/dev visibility only. Set
// NEXT_PUBLIC_SHOW_ICP_PANEL=true in .env.local to render it. Read once at
// module load: `NEXT_PUBLIC_*` is inlined by the bundler at build time, so
// flipping the flag requires a restart of `pnpm dev`.
const SUPERUSER_PANEL_ENABLED = process.env.NEXT_PUBLIC_SHOW_ICP_PANEL === 'true'

type SuperuserPanelContextValue = {
  enabled: boolean
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
    () => ({ enabled: SUPERUSER_PANEL_ENABLED, open, toggle }),
    [open, toggle],
  )

  return (
    <SuperuserPanelContext.Provider value={value}>{children}</SuperuserPanelContext.Provider>
  )
}

/**
 * Header-mounted icon button that opens/closes the superuser side panel.
 * Renders nothing when the gate flag is off, so prod builds never show it.
 */
export function SuperuserToggleButton() {
  const { enabled, open, toggle } = useSuperuserPanelContext()
  if (!enabled) return null

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
 * Visible only when the gate flag is on AND the toggle button has been
 * activated. The ICP polling hook is only mounted while the drawer is
 * actually open, so closed-state has no network cost.
 */
export function SuperuserPanel({ sessionId }: { sessionId: string | null }) {
  const { enabled, open } = useSuperuserPanelContext()
  if (!enabled || !open || !sessionId) return null

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-muted/30">
      <ScrollArea className="flex-1">
        <IcpFitCard sessionId={sessionId} />
      </ScrollArea>
    </div>
  )
}
