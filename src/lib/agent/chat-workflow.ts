/**
 * Durable chat workflow + step functions.
 *
 * WDK v4 quirk: only `'use step'` functions defined inside the same module
 * graph that the workflow file is discovered through end up registered in
 * the step worker bundle. In practice (and matching every working example
 * we've seen), the most reliable layout is to declare the steps in the same
 * file as the workflow and have the tool wrappers reference them.
 *
 * The directive `'use workflow'` lives inside `runChatWorkflow`'s body. The
 * route handler in `app/api/chat/route.ts` invokes this via `start()` from
 * `workflow/api`. Tools whose execute functions perform I/O reference the
 * named step functions defined below — those are the actual durable units.
 */

import { DurableAgent } from '@workflow/ai/agent'
import { getWritable } from 'workflow'
import { tool } from 'ai'
import { z } from 'zod'
import type { ModelMessage, UIMessageChunk } from 'ai'
import { AGENT_INSTRUCTIONS } from './instructions'
import { extendSummary } from './summary'
import { saveMessage } from '../db/queries/messages'
import {
  getSession,
  updateSessionSummary,
  type SessionMode,
} from '../db/queries/sessions'
import {
  saveVisitorFact as dbSaveVisitorFact,
  getVisitorFacts as dbGetVisitorFacts,
  type VisitorFact,
  type VisitorFactCategory,
} from '../db/queries/visitor-facts'
import {
  searchLcaKnowledge as dbSearchLcaKnowledge,
  type LcaKnowledgeHit,
} from '../db/queries/lca-knowledge'

interface SessionRuntimeState {
  mode: SessionMode
  summary: string
}

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

// ─── Pure helpers (not steps) ──────────────────────────────────────────────

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

// ─── Steps ─────────────────────────────────────────────────────────────────

async function persistAssistantMessage(chatId: string, text: string) {
  'use step'
  await saveMessage(chatId, 'assistant', text).catch(() => undefined)
}

async function loadVisitorFacts(sessionId: string): Promise<VisitorFact[]> {
  'use step'
  try {
    return await dbGetVisitorFacts(sessionId)
  } catch (err) {
    console.error('[loadVisitorFacts] failed', err)
    return []
  }
}

async function loadSessionState(sessionId: string): Promise<SessionRuntimeState> {
  'use step'
  try {
    const session = await getSession(sessionId)
    if (!session) return { mode: 'chat', summary: '' }
    return { mode: session.mode, summary: session.summary }
  } catch (err) {
    console.error('[loadSessionState] failed', err)
    return { mode: 'chat', summary: '' }
  }
}

async function extendSummaryStep(
  sessionId: string,
  previousSummary: string,
  userMessage: string,
  assistantMessage: string,
) {
  'use step'
  try {
    // Refetch facts here rather than passing them in: by the time this
    // runs (post-stream), the visitor may have just deleted one — using
    // the up-to-date list keeps the summary aligned with the panel.
    const facts = await dbGetVisitorFacts(sessionId)
    const updated = await extendSummary({
      previousSummary,
      userMessage,
      assistantMessage,
      facts,
    })
    if (updated.length > 0) {
      await updateSessionSummary(sessionId, updated)
    }
  } catch (err) {
    console.error('[extendSummaryStep] failed', err)
  }
}

type FetchResult = {
  success: boolean
  url: string
  content: string
  error: string | null
}

async function fetchPublicWebsite(url: string): Promise<FetchResult> {
  'use step'

  const validated = validatePublicUrl(url)
  if (!validated.ok) {
    return { success: false, url, content: '', error: validated.reason }
  }

  try {
    const res = await fetch(validated.url, {
      headers: {
        'User-Agent': 'LCA-Research-Bot/1.0 (+latecheckout.agency)',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
      },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    })

    if (!res.ok) {
      return {
        success: false,
        url,
        content: '',
        error: `HTTP ${res.status} ${res.statusText}`,
      }
    }

    const html = await res.text()
    const text = stripHtml(html).slice(0, 6000)
    return { success: true, url, content: text, error: null }
  } catch (err) {
    console.error('[fetch_website] failed', err)
    return {
      success: false,
      url,
      content: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

type WebSearchHit = {
  title: string
  url: string
  snippet: string
}

type WebSearchResult =
  | { success: true; query: string; results: WebSearchHit[]; answer: string | null }
  | { success: false; query: string; results: never[]; answer: null; error: string }

async function searchWeb(query: string): Promise<WebSearchResult> {
  'use step'

  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    return {
      success: false,
      query,
      results: [],
      answer: null,
      error:
        'Web search is not configured (TAVILY_API_KEY missing). Tell the visitor you cannot search the web right now.',
    }
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
        include_images: false,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return {
        success: false,
        query,
        results: [],
        answer: null,
        error: `Tavily HTTP ${res.status} ${res.statusText}`,
      }
    }

    const json = (await res.json()) as {
      answer?: string | null
      results?: Array<{ title?: string; url?: string; content?: string }>
    }

    const results: WebSearchHit[] = (json.results ?? []).slice(0, 5).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.content ?? '').slice(0, 600),
    }))

    return {
      success: true,
      query,
      results,
      answer: typeof json.answer === 'string' && json.answer.length > 0 ? json.answer : null,
    }
  } catch (err) {
    console.error('[search_web] failed', err)
    return {
      success: false,
      query,
      results: [],
      answer: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function persistVisitorFact(
  sessionId: string,
  fact: string,
  category: VisitorFactCategory,
  source: string,
) {
  'use step'

  try {
    const saved = await dbSaveVisitorFact(sessionId, fact, category, source)
    return { saved: true as const, id: saved.id, fact, category, source }
  } catch (err) {
    console.error('[save_visitor_fact] failed', err)
    return {
      saved: false as const,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function searchLcaKnowledgeStep(query: string): Promise<LcaKnowledgeHit[]> {
  'use step'

  try {
    return await dbSearchLcaKnowledge(query, 3)
  } catch (err) {
    console.error('[retrieve_lca_knowledge] failed', err)
    return []
  }
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

// ─── Helpers ───────────────────────────────────────────────────────────────

type UrlValidation = { ok: true; url: URL } | { ok: false; reason: string }

// Any URL the agent fetches is an SSRF surface (visitor-supplied or model-chosen).
// Block obvious internal targets before we let the serverless function fetch them.
// Note: this does not resolve DNS, so a domain that points at a private IP can
// still slip through — acceptable for this spike, since Vercel functions don't
// sit on a VPC.
function validatePublicUrl(input: string): UrlValidation {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http/https URLs are supported' }
  }

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost')) {
    return { ok: false, reason: 'Loopback hosts are not allowed' }
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return { ok: false, reason: 'Private or reserved IP ranges are not allowed' }
    }
  }

  // URL hostnames wrap IPv6 literals in brackets — strip them before matching.
  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = host.slice(1, -1)
    if (
      v6 === '::1' ||
      v6 === '::' ||
      v6.startsWith('fc') ||
      v6.startsWith('fd') ||
      v6.startsWith('fe8') ||
      v6.startsWith('fe9') ||
      v6.startsWith('fea') ||
      v6.startsWith('feb')
    ) {
      return { ok: false, reason: 'Private or loopback IPv6 is not allowed' }
    }
  }

  return { ok: true, url }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
