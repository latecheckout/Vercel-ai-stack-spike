/**
 * Multi-turn CLI harness for AGENT_INSTRUCTIONS.
 *
 * Runs an interactive conversation against the production model (Vercel
 * AI Gateway → claude-sonnet-4.5) with real tool implementations:
 *
 *   retrieve_lca_knowledge → real Supabase KB lookup
 *   search_web            → real Exa search
 *   fetch_website         → real Exa contents
 *   save_visitor_fact     → in-memory only (NO DB write)
 *   propose_lca_connect   → logged only
 *   offer_lca_connect     → real draftConnectEmail via Gateway (NO send)
 *
 * The system prompt is rebuilt each turn to include the in-memory facts
 * block, exactly like buildInstructions() does in chat/index.ts. This
 * makes multi-turn "fact memory" behave the same way it does in prod.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/test-instructions.ts
 *     [--message "<turn>" ...]   # scripted turns; otherwise interactive
 *     [--kb-empty]               # force retrieve_lca_knowledge to empty
 *     [--session <id>]           # telemetry only; no DB rows are written
 *
 * Examples:
 *   # interactive
 *   pnpm tsx --env-file=.env.local scripts/test-instructions.ts
 *
 *   # scripted 3-turn regression
 *   pnpm tsx --env-file=.env.local scripts/test-instructions.ts \
 *     --message "Hey, what services do you offer?" \
 *     --message "I'm Sarah, head of product at Verve — Series B." \
 *     --message "Can someone walk us through the Innovation Lab?"
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import {
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
  type ToolSet,
} from 'ai'
import { z } from 'zod'
import { AGENT_INSTRUCTIONS } from '../src/lib/agent/instructions'
import { draftConnectEmail } from '../src/lib/agent/connect-request'
import { searchLcaKnowledge } from '../src/lib/db/queries/lca-knowledge'
import type { VisitorFact, VisitorFactCategory } from '../src/lib/db/queries/visitor-facts'
import type { DbMessage } from '../src/lib/db/queries/messages'

const MODEL = 'anthropic/claude-sonnet-4.5'
const EXA_API_URL = 'https://api.exa.ai'

// ─── args ─────────────────────────────────────────────────────────────────

interface Args {
  scriptedMessages: string[]
  kbEmpty: boolean
  sessionId: string
}

function parseArgs(): Args {
  const raw = process.argv.slice(2)
  const messages: string[] = []
  let kbEmpty = false
  let sessionId: string = randomUUID()

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '--message' || a === '-m') {
      const next = raw[++i]
      if (next) messages.push(next)
    } else if (a === '--message-file' || a === '-f') {
      const path = raw[++i]
      if (path) messages.push(readFileSync(path, 'utf8'))
    } else if (a === '--kb-empty') {
      kbEmpty = true
    } else if (a === '--session') {
      const next = raw[++i]
      if (next) sessionId = next
    }
  }
  return { scriptedMessages: messages, kbEmpty, sessionId }
}

// ─── in-memory state (mirrors the prod buildInstructions input) ───────────

interface SessionState {
  sessionId: string
  facts: VisitorFact[]
  dbMessages: DbMessage[]
  modelMessages: ModelMessage[]
}

function makeFact(
  sessionId: string,
  fact: string,
  category: VisitorFactCategory,
  source: string,
): VisitorFact {
  return {
    id: randomUUID(),
    session_id: sessionId,
    fact,
    category,
    source,
    created_at: new Date().toISOString(),
  } as unknown as VisitorFact
}

function makeDbMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): DbMessage {
  return {
    id: randomUUID(),
    session_id: sessionId,
    role,
    content,
    created_at: new Date().toISOString(),
  } as unknown as DbMessage
}

function renderFactsBlock(facts: VisitorFact[]): string {
  if (facts.length === 0) return 'No visitor facts saved yet.'
  return facts
    .map((f) => `- [${f.category}] ${f.fact} (source: ${f.source})`)
    .join('\n')
}

function buildSystemPrompt(state: SessionState): string {
  return `${AGENT_INSTRUCTIONS}

## Visitor facts — current source of truth

This list is the authoritative state right now. The visitor can remove facts
from their panel at any time, so prior \`save_visitor_fact\` results in the
conversation history may be out of date. If a fact appeared in earlier tool
output but is NOT in the list below, the visitor has removed it — do not
reference it, and do not re-save it unless the visitor restates it.

${renderFactsBlock(state.facts)}`
}

// ─── pretty printing ──────────────────────────────────────────────────────

function preview(value: unknown, max = 240): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value)
  return json.length > max ? `${json.slice(0, max)}…` : json
}

function logTool(name: string, args: unknown, result: unknown) {
  console.log(`  → ${name}`)
  console.log(`      args:   ${preview(args)}`)
  console.log(`      result: ${preview(result)}`)
}

// ─── tools (real impls, see header comment for what's stubbed) ────────────

function buildTools(state: SessionState, kbEmpty: boolean): ToolSet {
  return {
    retrieve_lca_knowledge: tool({
      description:
        'Search the curated LCA knowledge base. Real Supabase lookup unless --kb-empty.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        if (kbEmpty) {
          const out = {
            found: false,
            results: [] as never[],
            note: 'No matching content found. Do not invent details — tell the visitor to email anthony@latecheckout.studio.',
          }
          logTool('retrieve_lca_knowledge', { query }, out)
          return out
        }
        try {
          const hits = await searchLcaKnowledge(query, 3)
          const out =
            hits.length === 0
              ? {
                  found: false,
                  results: [] as never[],
                  note: 'No matching content found. Do not invent details — tell the visitor to email anthony@latecheckout.studio.',
                }
              : {
                  found: true,
                  results: hits.map((h) => ({
                    id: h.id,
                    title: h.title,
                    category: h.category,
                    content: h.content,
                    source_url: h.source_url,
                  })),
                  note: undefined as string | undefined,
                }
          logTool('retrieve_lca_knowledge', { query }, {
            found: out.found,
            count: out.results.length,
            titles: out.results.map((r) => r.title),
          })
          return out
        } catch (err) {
          const out = {
            found: false,
            results: [] as never[],
            note: `KB lookup failed: ${err instanceof Error ? err.message : String(err)}`,
          }
          logTool('retrieve_lca_knowledge', { query }, out)
          return out
        }
      },
    }),

    fetch_website: tool({
      description: 'Real Exa /contents fetch.',
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        const out = await exaFetch(url)
        logTool('fetch_website', { url }, {
          success: out.success,
          chars: out.content.length,
          error: out.error,
        })
        return out
      },
    }),

    search_web: tool({
      description: 'Real Exa /search.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const out = await exaSearch(query)
        logTool('search_web', { query }, {
          success: out.success,
          count: out.success ? out.results.length : 0,
          firstUrl: out.success ? out.results[0]?.url : undefined,
          error: out.success ? undefined : out.error,
        })
        return out
      },
    }),

    save_visitor_fact: tool({
      description: 'In-memory only — no DB write.',
      inputSchema: z.object({
        fact: z.string(),
        category: z.enum(['company', 'role', 'website', 'project', 'other']),
        source: z.string(),
      }),
      execute: async ({ fact, category, source }) => {
        const saved = makeFact(state.sessionId, fact, category, source)
        state.facts.push(saved)
        const out = { saved: true, id: saved.id, fact, category, source }
        logTool('save_visitor_fact', { fact, category, source }, out)
        return out
      },
    }),

    propose_lca_connect: tool({
      description: 'UI signal — logged only.',
      inputSchema: z.object({ reason: z.string() }),
      execute: async ({ reason }) => {
        const out = { proposed: true as const, reason }
        logTool('propose_lca_connect', { reason }, out)
        return out
      },
    }),

    offer_lca_connect: tool({
      description: 'Real draftConnectEmail (Gateway) — NO email sent.',
      inputSchema: z.object({ reason: z.string() }),
      execute: async ({ reason }) => {
        try {
          const draft = await draftConnectEmail({
            messages: state.dbMessages,
            facts: state.facts,
          })
          const out = {
            ready: true as const,
            recipient: 'engineering@latecheckout.studio (not actually sent)',
            subject: draft.subject,
            body: draft.body,
            reason,
          }
          console.log(`  → offer_lca_connect`)
          console.log(`      reason:  ${reason}`)
          console.log(`      subject: ${draft.subject}`)
          console.log(`      body:\n${draft.body
            .split('\n')
            .map((l) => `        ${l}`)
            .join('\n')}`)
          return out
        } catch (err) {
          const out = {
            ready: false as const,
            error: err instanceof Error ? err.message : String(err),
            reason,
          }
          logTool('offer_lca_connect', { reason }, out)
          return out
        }
      },
    }),
  }
}

// ─── Exa helpers (mirror chat/steps.ts but plain — no 'use step') ─────────

interface FetchResult {
  success: boolean
  url: string
  content: string
  error: string | null
}

async function exaFetch(url: string): Promise<FetchResult> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return {
      success: false,
      url,
      content: '',
      error: 'Website fetch is not configured (EXA_API_KEY missing).',
    }
  }
  try {
    const res = await fetch(`${EXA_API_URL}/contents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ urls: [url], text: { maxCharacters: 6000 } }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      return {
        success: false,
        url,
        content: '',
        error: `Exa HTTP ${res.status} ${res.statusText}`,
      }
    }
    const json = (await res.json()) as {
      results?: Array<{ url?: string; text?: string }>
      statuses?: Array<{ status?: string; error?: { tag?: string } }>
    }
    const first = json.results?.[0]
    if (!first?.text) {
      const status = json.statuses?.[0]
      return {
        success: false,
        url,
        content: '',
        error: status?.error?.tag ?? status?.status ?? 'No content returned',
      }
    }
    return { success: true, url, content: first.text, error: null }
  } catch (err) {
    return {
      success: false,
      url,
      content: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

type SearchHit = { title: string; url: string; snippet: string }
type SearchResult =
  | { success: true; query: string; results: SearchHit[] }
  | { success: false; query: string; results: never[]; error: string }

async function exaSearch(query: string): Promise<SearchResult> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return {
      success: false,
      query,
      results: [],
      error: 'Web search is not configured (EXA_API_KEY missing).',
    }
  }
  try {
    const res = await fetch(`${EXA_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: 5,
        contents: { text: { maxCharacters: 600 } },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return {
        success: false,
        query,
        results: [],
        error: `Exa HTTP ${res.status} ${res.statusText}`,
      }
    }
    const json = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; text?: string }>
    }
    const results: SearchHit[] = (json.results ?? []).slice(0, 5).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.text ?? '').slice(0, 600),
    }))
    return { success: true, query, results }
  } catch (err) {
    return {
      success: false,
      query,
      results: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── turn loop ────────────────────────────────────────────────────────────

async function runTurn(
  state: SessionState,
  userText: string,
  kbEmpty: boolean,
  turnNumber: number,
) {
  console.log(`\n─── turn ${turnNumber} ───────────────────────────────────────`)
  console.log(`visitor> ${userText}`)
  console.log()

  state.modelMessages.push({ role: 'user', content: userText })
  state.dbMessages.push(makeDbMessage(state.sessionId, 'user', userText))

  const result = await generateText({
    model: MODEL,
    system: buildSystemPrompt(state),
    messages: state.modelMessages,
    tools: buildTools(state, kbEmpty),
    stopWhen: stepCountIs(8),
  })

  // Append the new model messages (assistant + tool roles) so the next
  // turn sees the full record of what just happened.
  state.modelMessages.push(...result.response.messages)
  if (result.text) {
    state.dbMessages.push(makeDbMessage(state.sessionId, 'assistant', result.text))
  }

  console.log(`\nassistant> ${result.text || '(no text — tool calls only)'}`)
  console.log(
    `\n[tokens: in=${result.usage.inputTokens} out=${result.usage.outputTokens} total=${result.usage.totalTokens}]`,
  )
}

// ─── entrypoint ───────────────────────────────────────────────────────────

async function main() {
  const { scriptedMessages, kbEmpty, sessionId } = parseArgs()

  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error('AI_GATEWAY_API_KEY is not set. Add it to .env.local.')
    process.exit(1)
  }
  if (!kbEmpty && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    console.error(
      'Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or pass --kb-empty to skip the KB.',
    )
    process.exit(1)
  }

  const state: SessionState = {
    sessionId,
    facts: [],
    dbMessages: [],
    modelMessages: [],
  }

  console.log('─── test-instructions (multi-turn) ──────────────────────────')
  console.log(`model:      ${MODEL}`)
  console.log(`session id: ${sessionId}`)
  console.log(`kb mode:    ${kbEmpty ? 'forced empty' : 'real Supabase'}`)
  console.log(`exa:        ${process.env.EXA_API_KEY ? 'configured' : 'NOT configured (web tools will return "unavailable")'}`)
  console.log(`facts/DB:   in-memory only (no rows are written)`)
  console.log(`prompt:     ${AGENT_INSTRUCTIONS.split('\n').length} lines, ${AGENT_INSTRUCTIONS.length} chars`)
  console.log(`mode:       ${scriptedMessages.length > 0 ? `scripted (${scriptedMessages.length} turn${scriptedMessages.length === 1 ? '' : 's'})` : 'interactive (type \'exit\' or Ctrl+D to quit)'}`)

  if (scriptedMessages.length > 0) {
    let n = 1
    for (const msg of scriptedMessages) {
      await runTurn(state, msg, kbEmpty, n++)
    }
    return
  }

  const rl = readline.createInterface({ input, output })
  try {
    let n = 1
    while (true) {
      const answer = await rl.question('\nvisitor> ')
      const trimmed = answer.trim()
      if (!trimmed) continue
      if (trimmed === 'exit' || trimmed === 'quit') break
      await runTurn(state, trimmed, kbEmpty, n++)
    }
  } finally {
    rl.close()
  }

  console.log('\n─── final state ────────────────────────────────────────────')
  console.log(`facts saved (in-memory): ${state.facts.length}`)
  for (const f of state.facts) {
    console.log(`  - [${f.category}] ${f.fact} (source: ${f.source})`)
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err)
  process.exit(1)
})
