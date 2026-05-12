/**
 * Durable chat workflow.
 *
 * The `'use workflow'` directive lives inside `runChatWorkflow`. The route
 * handler at `app/api/chat/route.ts` invokes it via `start()` from
 * `workflow/api`. Tool `execute` functions are thin wrappers that call the
 * durable step functions defined in `./steps.ts` — the steps are the actual
 * units of replayable work.
 *
 * Layout follows the Workflow SDK's recommended structure for projects with
 * multiple workflows: each workflow lives in its own directory with an
 * `index.ts` (workflow + tool wrappers) and a `steps.ts` (or `steps/` folder).
 */

import { DurableAgent } from '@workflow/ai/agent'
import { getWritable } from 'workflow'
import { tool } from 'ai'
import { z } from 'zod'
import type { ModelMessage, UIMessageChunk } from 'ai'
import { AGENT_INSTRUCTIONS } from '../instructions'
import { type VisitorFact } from '../../db/queries/visitor-facts'
import {
  persistAssistantMessage,
  loadVisitorFacts,
  loadSessionState,
  extendSummaryStep,
  fetchPublicWebsite,
  searchWeb,
  persistVisitorFact,
  searchLcaKnowledgeStep,
} from './steps'

// ─── Workflow ──────────────────────────────────────────────────────────────

export async function runChatWorkflow(chatId: string, messages: ModelMessage[]) {
  'use workflow'

  const writable = getWritable<UIMessageChunk>()

  // Load mode/summary and facts upfront. Both fan out to the DB; running
  // them in parallel keeps the time-to-first-token down.
  const [sessionState, currentFacts] = await Promise.all([
    loadSessionState(chatId),
    loadVisitorFacts(chatId),
  ])

  const isSummaryMode = sessionState.mode === 'summary'
  const latestUserText = extractLastUserText(messages)

  // In summary mode we strip everything but the latest user turn. The model
  // gets its "memory" from the summary block in the system prompt — sending
  // the rest of `messages` would defeat the entire point of the mode.
  const messagesForModel: ModelMessage[] = isSummaryMode
    ? buildSummaryModeMessages(latestUserText)
    : messages

  const agent = new DurableAgent({
    model: 'anthropic/claude-sonnet-4.5',
    instructions: buildInstructions({
      facts: currentFacts,
      summary: isSummaryMode ? sessionState.summary : null,
    }),
    tools: {
      retrieve_lca_knowledge: makeRetrieveLcaKnowledgeTool(),
      fetch_website: makeFetchWebsiteTool(),
      search_web: makeSearchWebTool(),
      save_visitor_fact: makeSaveVisitorFactTool(chatId),
    },
    onFinish: async ({ text }) => {
      await persistAssistantMessage(chatId, text)
      if (isSummaryMode && latestUserText.length > 0 && text.length > 0) {
        await extendSummaryStep(
          chatId,
          sessionState.summary,
          latestUserText,
          text,
        )
      }
    },
  })

  await agent.stream({
    messages: messagesForModel,
    writable,
    maxSteps: 12,
  })
}

function buildInstructions(input: {
  facts: VisitorFact[]
  summary: string | null
}): string {
  const factsBlock =
    input.facts.length === 0
      ? 'No visitor facts saved yet.'
      : input.facts
          .map((f) => `- [${f.category}] ${f.fact} (source: ${f.source})`)
          .join('\n')

  const summaryBlock =
    input.summary === null
      ? ''
      : `

## Rolling conversation summary (summary mode)

You are operating in *summary mode*: the visitor's earlier messages are
NOT in the prompt this turn. Treat the summary below as the entirety of
the prior conversation. If something is not in the summary or the
visitor facts list, it did not happen — do not pretend to remember it.

${
  input.summary.trim().length === 0
    ? '(No prior summary yet — this is the first turn.)'
    : input.summary
}`

  return `${AGENT_INSTRUCTIONS}

## Visitor facts — current source of truth

This list is the authoritative state right now. The visitor can remove facts
from their panel at any time, so prior \`save_visitor_fact\` results in the
conversation history may be out of date. If a fact appeared in earlier tool
output but is NOT in the list below, the visitor has removed it — do not
reference it, and do not re-save it unless the visitor restates it.

${factsBlock}${summaryBlock}`
}

// ─── Pure workflow-side helpers ────────────────────────────────────────────

function extractLastUserText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    return m.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim()
  }
  return ''
}

function buildSummaryModeMessages(userText: string): ModelMessage[] {
  // Empty array would make agent.stream a no-op; fall back to a placeholder
  // so the agent has something to react to. Practically `latestUserText`
  // is always populated because the route only invokes the workflow on
  // POST with a user message.
  const text = userText.length > 0 ? userText : '(empty message)'
  return [{ role: 'user', content: text }]
}

// ─── Tool wrappers (NOT steps) ─────────────────────────────────────────────

function makeRetrieveLcaKnowledgeTool() {
  return tool({
    description:
      'Search the curated LCA knowledge base for approved content about services, ' +
      'case studies, approach, hiring, and capabilities. ' +
      'Always call this before making any factual statement about LCA.',
    inputSchema: z.object({
      query: z.string().describe('Natural-language question or topic to look up'),
    }),
    execute: async ({ query }) => {
      const results = await searchLcaKnowledgeStep(query)

      if (results.length === 0) {
        return {
          found: false,
          results: [] as never[],
          note: 'No matching content found. Do not invent details — tell the visitor to email anthony@latecheckout.studio.',
        }
      }

      return {
        found: true,
        results: results.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          content: item.content,
          source_url: item.source_url,
        })),
        note: undefined as string | undefined,
      }
    },
  })
}

function makeFetchWebsiteTool() {
  return tool({
    description:
      'Fetch and read a public webpage. Use this proactively to learn about the ' +
      'visitor — e.g. when they mention a company, give an email (try https://<domain>), ' +
      'or share a URL. Before calling, tell the visitor what you are doing, e.g. ' +
      '"Give me a sec — checking <site>." Public pages only.',
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe('The full https URL to fetch (must be a public webpage)'),
    }),
    execute: async ({ url }) => fetchPublicWebsite(url),
  })
}

function makeSearchWebTool() {
  return tool({
    description:
      'Run a web search to find information about the visitor or what they mentioned ' +
      '— their company, their product, a competitor they referenced, etc. ' +
      'Use this proactively the first time the visitor names a company or product so ' +
      'you can verify details back to them. Then call fetch_website on the best-looking ' +
      'result. Public web only — never use this to look up a person by name or email.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Natural-language search query, e.g. "Acme Corp official website" or ' +
            '"WidgetPro product features"',
        ),
    }),
    execute: async ({ query }) => searchWeb(query),
  })
}

function makeSaveVisitorFactTool(sessionId: string) {
  return tool({
    description:
      'Save a fact you have learned about the visitor to the database. ' +
      'Call this each time the visitor confirms new information about themselves. ' +
      'The fact will appear in the "What LCA knows about you" panel immediately.',
    inputSchema: z.object({
      fact: z.string().describe('The specific fact — concise, one sentence'),
      category: z
        .enum(['company', 'role', 'website', 'project', 'other'])
        .describe('company | role | website | project | other'),
      source: z
        .string()
        .describe(
          'How this was obtained: "visitor stated", "from website example.com", etc.',
        ),
    }),
    execute: async ({ fact, category, source }) =>
      persistVisitorFact(sessionId, fact, category, source),
  })
}
