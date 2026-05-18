import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'

// `tier` is `string` in generated types (CHECK constraint, not a true
// enum). Narrow it here so callers get the union.
export type IcpTier = 'high' | 'medium' | 'low' | 'unclear'

export type IcpFundingStatus = 'funded' | 'unfunded' | 'unknown'
export type IcpCompanyStage =
  | 'enterprise'
  | 'venture_backed'
  | 'growth'
  | 'smb'
  | 'individual'
  | 'unknown'
export type IcpLevel = 'high' | 'medium' | 'low' | 'unclear'

export interface IcpSignals {
  funding_status: IcpFundingStatus
  company_stage: IcpCompanyStage
  ambition: IcpLevel
  engagement_fit: IcpLevel
  anti_signals: string[]
}

export type IcpEvaluation = Omit<Tables<'icp_evaluations'>, 'tier' | 'signals'> & {
  tier: IcpTier
  signals: IcpSignals
}

export interface SaveIcpEvaluationInput {
  sessionId: string
  score: number
  tier: IcpTier
  rationale: string
  signals: IcpSignals
  recommendation: string
}

export async function saveIcpEvaluation(
  input: SaveIcpEvaluationInput,
): Promise<IcpEvaluation> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('icp_evaluations')
    .insert({
      session_id: input.sessionId,
      score: input.score,
      tier: input.tier,
      rationale: input.rationale,
      // Cast because the generated `signals` type is `Json`. The runtime
      // shape is validated by the evaluator's zod schema before we get here.
      signals: input.signals as unknown as Tables<'icp_evaluations'>['signals'],
      recommendation: input.recommendation,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save ICP evaluation: ${error.message}`)
  return data as unknown as IcpEvaluation
}

/**
 * Return the most recent ICP evaluation for a session, or null if none
 * have run yet (fresh visitor, or eval hasn't completed for the current
 * turn). The UI polls this so it picks up the latest as soon as it lands.
 */
export async function getLatestIcpEvaluation(
  sessionId: string,
): Promise<IcpEvaluation | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('icp_evaluations')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to load ICP evaluation: ${error.message}`)
  if (!data) return null
  return data as unknown as IcpEvaluation
}
