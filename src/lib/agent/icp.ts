/**
 * Ideal Customer Profile (ICP) evaluator.
 *
 * Runs in parallel with — and never blocks — the chat workflow's response
 * stream. It looks at the cumulative state of the conversation (visitor
 * facts + recent transcript) and produces a structured fit score against
 * LCA's ICP. The result is persisted to `icp_evaluations` and surfaced in
 * the right-hand panel.
 *
 * Like `summary.ts` and `connect-request.ts`, this module is a plain
 * `generateObject` helper — it is NOT a `'use step'` function. The step
 * wrapper lives in `chat/steps.ts` so the flow worker can call it via the
 * step worker route (the only place `fetch` is available).
 */
import { generateObject } from 'ai'
import { z } from 'zod'
import type { VisitorFact } from '../db/queries/visitor-facts'
import type { DbMessage } from '../db/queries/messages'
import { renderFactsBlock, renderMessageTranscript } from './render-context'

const ICP_MODEL = 'anthropic/claude-sonnet-4.5'

// How much of the transcript to feed the evaluator. The full transcript
// would balloon prompt cost for long conversations; the last few turns
// plus the facts list are enough to score fit. The summary (when present)
// is sent instead — it's the dense form.
const RECENT_TURN_LIMIT = 12

const LCA_ICP_DEFINITION = `LCA ("Late Checkout Agency") positions itself as the design firm for the
AI Age. Our Ideal Customer Profile (ICP):

Core profile — Ambitious, well-funded companies building AI-native
products who need world-class design, strategy, and build partners.
The ICP skews toward orgs that want to push beyond interfaces into
experiences that define this era.

Qualifying signals (in priority order):
1. Public funding — the single most critical signal. Funded companies are
   the highest-fit lead. Both venture-backed startups and enterprises
   with real budgets qualify.
2. Company stage — venture-backed startups with momentum OR larger
   enterprises with serious budgets. Reference clients on the showcase:
   Epic Games, Shopify, Warner Music, Reddit, Intuit, Jasper, Serko.
3. Product / design ambition — leadership cares about taste, craft, and
   shipping AI-native experiences. Not just looking for outsourced
   execution.
4. Engagement fit — needs match LCA's offerings: product/brand sprints,
   AI-powered product builds, custom agents and workflow automations,
   AI workshops/acceleration for internal teams.

Anti-ICP (not a fit):
- Small businesses without funding.
- Low-budget logo/website shops or anyone who just wants a vendor.
- Solo founders pre-funding looking for cheap execution.

Tier rubric:
- "high"    — Funded company (venture or enterprise) + clear product
              ambition + engagement that matches LCA's offerings.
- "medium"  — Two of three: funded/notable company, clear ambition,
              or strong engagement fit. Worth a real follow-up.
- "low"     — Smaller / unfunded / wrong fit. Anti-signals present.
- "unclear" — Not enough information yet to score. Default for very
              short conversations or when the visitor hasn't shared
              role / company.

Score (0-100) should correlate with tier:
  high: 75-100, medium: 50-74, low: 0-49, unclear: 0-100 (often around 50
  if there's some signal, lower if effectively no signal yet).`

export const IcpEvaluationSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe('Overall ICP fit score 0-100. See the tier rubric in the system prompt.'),
  tier: z
    .enum(['high', 'medium', 'low', 'unclear'])
    .describe(
      'Coarse bucket. Use "unclear" only when there is genuinely not enough information yet — not as a hedge.',
    ),
  rationale: z
    .string()
    .max(400)
    .describe(
      '1–2 short sentences explaining the score in plain language. No marketing copy.',
    ),
  signals: z
    .object({
      funding_status: z.enum(['funded', 'unfunded', 'unknown']),
      company_stage: z.enum([
        'enterprise',
        'venture_backed',
        'growth',
        'smb',
        'individual',
        'unknown',
      ]),
      ambition: z.enum(['high', 'medium', 'low', 'unclear']),
      engagement_fit: z.enum(['high', 'medium', 'low', 'unclear']),
      anti_signals: z
        .array(z.string().max(120))
        .max(5)
        .describe('Concrete disqualifying observations; empty array if none.'),
    })
    .describe('Per-signal breakdown that backs the overall score.'),
  recommendation: z
    .string()
    .max(160)
    .describe(
      'One-line next step for LCA, e.g. "Offer to connect with a partner", "Keep nurturing", "Politely decline".',
    ),
})

export type IcpEvaluationResult = z.infer<typeof IcpEvaluationSchema>

export interface EvaluateIcpInput {
  facts: VisitorFact[]
  messages: DbMessage[]
  /** Rolling summary, when the session is in summary mode. Empty string if
   *  unavailable. Sent in addition to (not instead of) the recent
   *  transcript — both views help the evaluator. */
  summary: string
}

export async function evaluateIcp(
  input: EvaluateIcpInput,
): Promise<IcpEvaluationResult> {
  const summaryBlock =
    input.summary.trim().length > 0
      ? `Rolling conversation summary:\n${input.summary.trim()}`
      : '(no rolling summary)'

  const { object } = await generateObject({
    model: ICP_MODEL,
    schema: IcpEvaluationSchema,
    system: `You are an inbound lead-scoring assistant for LCA. You read what we
know about a website visitor — their confirmed facts and the recent
conversation transcript — and you score how well they match LCA's
Ideal Customer Profile.

${LCA_ICP_DEFINITION}

Rules:
- Be honest. Do not inflate scores to be polite. A small unfunded
  business should be scored "low" even if they are pleasant.
- Treat the confirmed visitor facts as authoritative. If the transcript
  contradicts a fact, trust the fact.
- Use "unclear" / "unknown" generously when you genuinely do not know —
  it is much better than guessing. Anti-signals (e.g. "asked for a $500
  logo") should not be invented; only flag what was actually said.
- The recommendation is one short line aimed at the LCA team, not the
  visitor.`,
    prompt: `Confirmed visitor facts (authoritative):
${renderFactsBlock(input.facts)}

${summaryBlock}

Recent conversation (last ${RECENT_TURN_LIMIT} turns at most):
${renderMessageTranscript(input.messages, RECENT_TURN_LIMIT)}

Score the visitor against the ICP now.`,
  })

  return object
}
