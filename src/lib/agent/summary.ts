/**
 * Rolling-summary helpers for Summary Mode (Mode 2).
 *
 * The summary is a structured-prose record of everything the agent has
 * learned about the visitor and the conversation. It replaces the
 * full message history that Mode 1 sends to the model each turn — so this
 * file owns the prompts that keep it tight, accurate, and free of stale
 * facts after a deletion.
 *
 * All three helpers use `generateText` against the Vercel AI Gateway.
 * They are *not* `'use step'` functions — they are plain async helpers
 * intended to be called either from API routes (regenerate, prune) or
 * from a `'use step'` wrapper inside `chat-workflow.ts` (extend).
 */
import { generateText } from 'ai'
import type { VisitorFact } from '../db/queries/visitor-facts'
import type { DbMessage } from '../db/queries/messages'

const SUMMARY_MODEL = 'anthropic/claude-sonnet-4.5'

const SUMMARY_STYLE_GUIDE = `Style:
- 4–10 short bullets max, grouped under bold section headings when useful.
- Cover: who the visitor is, what they're working on, which LCA topics have
  come up, and any commitments or follow-ups.
- Second person ("you mentioned…"), no preamble, no closing remark.
- Do not invent facts. If something is uncertain, leave it out.
- Treat the visitor facts list as authoritative — anything not consistent
  with it must be dropped.`

function renderFactsBlock(facts: VisitorFact[]): string {
  if (facts.length === 0) return '(no confirmed facts yet)'
  return facts.map((f) => `- [${f.category}] ${f.fact}`).join('\n')
}

/**
 * Extend an existing summary with one new turn. Called per-turn while the
 * session is in summary mode.
 */
export async function extendSummary(input: {
  previousSummary: string
  userMessage: string
  assistantMessage: string
  facts: VisitorFact[]
}): Promise<string> {
  const prev =
    input.previousSummary.trim().length > 0
      ? input.previousSummary
      : '(no prior summary — this is the first turn)'

  const { text } = await generateText({
    model: SUMMARY_MODEL,
    system: `You maintain a rolling summary of a chat between a visitor and the LCA
chatbot. You receive the previous summary, the latest turn, and the
authoritative list of visitor facts. Produce an updated summary.

${SUMMARY_STYLE_GUIDE}`,
    prompt: `Previous summary:
${prev}

Confirmed visitor facts (authoritative):
${renderFactsBlock(input.facts)}

Latest turn:
Visitor: ${input.userMessage}
LCA: ${input.assistantMessage}

Write the updated summary now.`,
  })

  return text.trim()
}

/**
 * Regenerate the summary from the full transcript. Used when the visitor
 * switches into summary mode mid-conversation — we need to seed the
 * summary from whatever happened in chat mode.
 */
export async function regenerateFromTranscript(input: {
  messages: DbMessage[]
  facts: VisitorFact[]
}): Promise<string> {
  if (input.messages.length === 0) return ''

  const transcript = input.messages
    .map(
      (m) =>
        `${m.role === 'user' ? 'Visitor' : 'LCA'}: ${m.content}`,
    )
    .join('\n\n')

  const { text } = await generateText({
    model: SUMMARY_MODEL,
    system: `You build a rolling summary of a chat between a visitor and the LCA
chatbot. You receive the full transcript and the authoritative list of
visitor facts. Produce a single summary that captures everything the
agent has learned and what's been discussed.

${SUMMARY_STYLE_GUIDE}`,
    prompt: `Confirmed visitor facts (authoritative):
${renderFactsBlock(input.facts)}

Transcript:
${transcript}

Write the summary now.`,
  })

  return text.trim()
}

/**
 * Rewrite an existing summary to omit a fact the visitor just deleted from
 * the panel. Called by the regenerate-summary endpoint after a delete in
 * summary mode.
 *
 * `facts` is the *post-deletion* list of facts — passed in so the prompt
 * has the authoritative source of truth and the model isn't tempted to
 * reintroduce neighbouring details that are also gone.
 */
export async function pruneSummary(input: {
  previousSummary: string
  removedFact: string
  facts: VisitorFact[]
}): Promise<string> {
  if (input.previousSummary.trim().length === 0) return ''

  const { text } = await generateText({
    model: SUMMARY_MODEL,
    system: `You revise a rolling summary of a chat between a visitor and the LCA
chatbot. The visitor has just removed a fact from their profile. Rewrite
the summary so that fact (and anything that depends on it) is no longer
mentioned. Keep everything else that is still consistent with the
remaining confirmed facts.

${SUMMARY_STYLE_GUIDE}`,
    prompt: `Removed fact (must not appear in the new summary):
${input.removedFact}

Confirmed visitor facts after removal (authoritative):
${renderFactsBlock(input.facts)}

Previous summary:
${input.previousSummary}

Write the revised summary now.`,
  })

  return text.trim()
}
