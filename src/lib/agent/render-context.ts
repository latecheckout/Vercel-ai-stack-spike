/**
 * Shared rendering helpers for the agent modules.
 *
 * Used by `icp.ts`, `summary.ts`, and `connect-request.ts` to format
 * visitor facts and chat transcripts for LLM prompts.
 */

import type { VisitorFact } from '../db/queries/visitor-facts'
import type { DbMessage } from '../db/queries/messages'

export function renderFactsBlock(facts: VisitorFact[]): string {
  if (facts.length === 0) return '(no confirmed facts yet)'
  return facts.map((f) => `- [${f.category}] ${f.fact}`).join('\n')
}

export function renderMessageTranscript(
  messages: DbMessage[],
  tail?: number,
): string {
  const items = tail != null ? messages.slice(-tail) : messages
  if (items.length === 0) return '(no messages yet)'
  return items
    .map((m) => `${m.role === 'user' ? 'Visitor' : 'LCA'}: ${m.content}`)
    .join('\n\n')
}
