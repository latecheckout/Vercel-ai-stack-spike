'use client'

import { Target, TrendingUp, Sparkles, Minus, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useIcpScore } from '@/hooks/use-icp-score'
import { cn } from '@/lib/utils'
import type { IcpEvaluation, IcpTier } from '@/lib/db/queries/icp-evaluations'

/**
 * Card showing how well the current visitor matches LCA's Ideal Customer
 * Profile. Updated once per assistant turn by the `evaluateIcpStep` step
 * that runs in the workflow's `onFinish`. Polls `/api/icp/[sessionId]`
 * while a session is active.
 *
 * Visibility is gated upstream by [[superuser-panel]], which only mounts
 * this when the shield-icon drawer is open — so the polling hook stays
 * dormant while the drawer is closed.
 */
export function IcpFitCard({ sessionId }: { sessionId: string | null }) {
  if (!sessionId) return null
  return <IcpFitCardContent sessionId={sessionId} />
}

function IcpFitCardContent({ sessionId }: { sessionId: string }) {
  const { data: evaluation, isLoading } = useIcpScore(sessionId)

  return (
    <div className="bg-background px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Target className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          ICP fit
        </p>
      </div>

      {isLoading && !evaluation ? (
        <p className="text-xs text-muted-foreground">Scoring…</p>
      ) : evaluation ? (
        <IcpDetails evaluation={evaluation} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Waiting for the first turn — fit gets scored after each reply.
        </p>
      )}
    </div>
  )
}

const TIER_META: Record<
  IcpTier,
  {
    label: string
    badgeClass: string
    barClass: string
    Icon: React.ComponentType<{ className?: string }>
  }
> = {
  high: {
    label: 'High fit',
    badgeClass: 'border-transparent bg-emerald-100 text-emerald-900',
    barClass: 'bg-emerald-500',
    Icon: TrendingUp,
  },
  medium: {
    label: 'Medium fit',
    badgeClass: 'border-transparent bg-amber-100 text-amber-900',
    barClass: 'bg-amber-500',
    Icon: Sparkles,
  },
  low: {
    label: 'Low fit',
    badgeClass: 'border-transparent bg-slate-100 text-slate-700',
    barClass: 'bg-slate-400',
    Icon: Minus,
  },
  unclear: {
    label: 'Unclear',
    badgeClass: 'border-transparent bg-muted text-muted-foreground',
    barClass: 'bg-muted-foreground/40',
    Icon: AlertTriangle,
  },
}

function IcpDetails({ evaluation }: { evaluation: IcpEvaluation }) {
  const meta = TIER_META[evaluation.tier]
  const { Icon } = meta
  const pct = Math.max(0, Math.min(100, evaluation.score))
  const antiSignals = evaluation.signals.anti_signals ?? []

  return (
    <div>
      <div className="flex items-center gap-2">
        <Badge className={cn('gap-1 text-[10px]', meta.badgeClass)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {pct}
        </span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', meta.barClass)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {evaluation.rationale.trim().length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          {evaluation.rationale}
        </p>
      )}

      <SignalsGrid evaluation={evaluation} />

      {antiSignals.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-900">
            Anti-signals
          </p>
          <ul className="mt-1 space-y-0.5">
            {antiSignals.map((s, i) => (
              <li key={`${i}-${s}`} className="text-[11px] leading-snug text-amber-900">
                • {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.recommendation.trim().length > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
          <span className="font-semibold uppercase tracking-widest">
            Next:
          </span>{' '}
          {evaluation.recommendation}
        </p>
      )}
    </div>
  )
}

function SignalsGrid({ evaluation }: { evaluation: IcpEvaluation }) {
  const { signals } = evaluation
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Funding', value: humaniseFunding(signals.funding_status) },
    { label: 'Stage', value: humaniseStage(signals.company_stage) },
    { label: 'Ambition', value: humaniseLevel(signals.ambition) },
    { label: 'Engagement', value: humaniseLevel(signals.engagement_fit) },
  ]
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-2">
          <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {row.label}
          </dt>
          <dd className="text-[11px] text-foreground/90">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function humaniseFunding(value: string): string {
  switch (value) {
    case 'funded':
      return 'Funded'
    case 'unfunded':
      return 'Unfunded'
    default:
      return 'Unknown'
  }
}

function humaniseStage(value: string): string {
  switch (value) {
    case 'enterprise':
      return 'Enterprise'
    case 'venture_backed':
      return 'VC-backed'
    case 'growth':
      return 'Growth'
    case 'smb':
      return 'SMB'
    case 'individual':
      return 'Individual'
    default:
      return 'Unknown'
  }
}

function humaniseLevel(value: string): string {
  switch (value) {
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
    default:
      return 'Unclear'
  }
}
