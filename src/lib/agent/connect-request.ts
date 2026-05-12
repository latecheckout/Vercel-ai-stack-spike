/**
 * Helpers for the "connect with someone at LCA" flow.
 *
 * The chat agent decides (via the `offer_lca_connect` tool) when the
 * conversation has enough substance to warrant offering an intro to a
 * human at LCA. This module turns the transcript + visitor facts into a
 * draft subject line and email body that the visitor can review and send.
 *
 * Like `summary.ts`, these helpers run `generateText` against the Vercel
 * AI Gateway and are NOT `'use step'` functions — they are plain async
 * helpers wrapped by a step in `chat/steps.ts`.
 */
import { generateText } from 'ai'
import type { VisitorFact } from '../db/queries/visitor-facts'
import type { DbMessage } from '../db/queries/messages'

const CONNECT_MODEL = 'anthropic/claude-sonnet-4.5'

export interface ConnectDraft {
  subject: string
  body: string
}

function renderFactsBlock(facts: VisitorFact[]): string {
  if (facts.length === 0) return '(none confirmed yet)'
  return facts.map((f) => `- [${f.category}] ${f.fact}`).join('\n')
}

function renderTranscript(messages: DbMessage[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'Visitor' : 'LCA'}: ${m.content}`)
    .join('\n\n')
}

/**
 * Draft a subject line and body for a "intro a visitor to LCA" email.
 *
 * The body is addressed to Anthony at LCA (the recipient) and written in
 * the visitor's voice ("I just chatted with the LCA bot and would love
 * to follow up about…"). The subject is short, concrete, and pulls in
 * the visitor's company/project when known.
 *
 * Returns plain text — the API route renders it to HTML at send time.
 */
export async function draftConnectEmail(input: {
  messages: DbMessage[]
  facts: VisitorFact[]
}): Promise<ConnectDraft> {
  const { text } = await generateText({
    model: CONNECT_MODEL,
    system: `You draft a short intro email from a website visitor to Anthony at
Late Checkout (LCA). The visitor has just had a chat with the LCA bot and
opted in to get connected with a human. Your job: write a subject line
and a body the visitor can review, edit, and send.

Voice: the visitor's, in first person ("I just chatted with the LCA
bot…"). Warm and direct, not salesy. No marketing copy. Markdown allowed
in the body for light structure (a short paragraph + 2–4 bullets).

Subject: short and concrete. Pull in the visitor's company or project
when you know it. Examples: "Following up on our chat — <Company>",
"Re: AI rollout at <Company>", "Quick intro — <Project>".

Body must:
- Open with a one-line context ("I just chatted with the LCA bot about
  <topic>.")
- Summarise what they shared (role, company, what they're working on) and
  what they're hoping to explore with LCA — pulled from the transcript
  and the confirmed facts list. Do not invent details.
- End with a short call to action — what they're hoping for next (a
  call, an intro, more info on a specific service).
- No sign-off line (the form will add one), no "Best, [Name]".

Output format — return exactly this, nothing else:

SUBJECT: <one line subject>

BODY:
<the body text, markdown allowed>`,
    prompt: `Confirmed visitor facts (authoritative — these are facts the visitor
explicitly confirmed about themselves):
${renderFactsBlock(input.facts)}

Conversation transcript:
${renderTranscript(input.messages)}

Draft the email now.`,
  })

  return parseDraft(text)
}

function parseDraft(raw: string): ConnectDraft {
  const trimmed = raw.trim()
  const subjectMatch = trimmed.match(/^SUBJECT:\s*(.+?)\s*\n/i)
  const bodyMatch = trimmed.match(/\nBODY:\s*\n([\s\S]+)$/i)

  const subject = subjectMatch?.[1]?.trim() ?? 'Following up on our LCA chat'
  const body = bodyMatch?.[1]?.trim() ?? trimmed

  return { subject, body }
}
