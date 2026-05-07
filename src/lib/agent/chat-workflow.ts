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
import { saveMessage } from '../db/queries/messages'
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

// ─── Workflow ──────────────────────────────────────────────────────────────

export async function runChatWorkflow(chatId: string, messages: ModelMessage[]) {
  'use workflow'

  const writable = getWritable<UIMessageChunk>()

  // Reload the current facts every turn. The visitor can delete facts from
  // the panel; without this, the model would keep referencing them because
  // the `save_visitor_fact` tool calls and their results still live in the
  // conversation history.
  const currentFacts = await loadVisitorFacts(chatId)

  const agent = new DurableAgent({
    model: 'anthropic/claude-sonnet-4.5',
    instructions: buildInstructions(currentFacts),
    tools: {
      retrieve_lca_knowledge: makeRetrieveLcaKnowledgeTool(),
      research_visitor: makeResearchVisitorTool(),
      save_visitor_fact: makeSaveVisitorFactTool(chatId),
    },
    onFinish: async ({ text }) => {
      await persistAssistantMessage(chatId, text)
    },
  })

  await agent.stream({
    messages,
    writable,
    maxSteps: 12,
  })
}

function buildInstructions(facts: VisitorFact[]): string {
  const factsBlock =
    facts.length === 0
      ? 'No visitor facts saved yet.'
      : facts
          .map((f) => `- [${f.category}] ${f.fact} (source: ${f.source})`)
          .join('\n')

  return `${AGENT_INSTRUCTIONS}

## Visitor facts — current source of truth

This list is the authoritative state right now. The visitor can remove facts
from their panel at any time, so prior \`save_visitor_fact\` results in the
conversation history may be out of date. If a fact appeared in earlier tool
output but is NOT in the list below, the visitor has removed it — do not
reference it, and do not re-save it unless the visitor restates it.

${factsBlock}`
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

type ResearchResult = {
  success: boolean
  url: string
  content: string
  error: string | null
}

async function fetchVisitorSite(url: string): Promise<ResearchResult> {
  'use step'

  const validated = validateVisitorUrl(url)
  if (!validated.ok) {
    return { success: false, url, content: '', error: validated.reason }
  }

  try {
    const res = await fetch(validated.url, {
      headers: {
        'User-Agent': 'LCA-Research-Bot/1.0 (reading your site as requested in chat)',
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
    console.error('[research_visitor] failed', err)
    return {
      success: false,
      url,
      content: '',
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

function makeResearchVisitorTool() {
  return tool({
    description:
      'Fetch and analyse a public URL that the visitor has explicitly provided. ' +
      'Before calling, tell the visitor: "Give me a sec — reading your site." ' +
      'Only call with URLs the visitor gave you. Public pages only.',
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .describe("The visitor's URL — must have been explicitly provided by them"),
    }),
    execute: async ({ url }) => fetchVisitorSite(url),
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

// Visitor-supplied URLs are an SSRF surface. Block obvious internal targets
// before we let the serverless function fetch them. Note: this does not
// resolve DNS, so a domain that points at a private IP can still slip through
// — acceptable for this spike, since Vercel functions don't sit on a VPC.
function validateVisitorUrl(input: string): UrlValidation {
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
