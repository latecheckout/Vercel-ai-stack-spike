/**
 * Baseline-locked eval runner.
 *
 * Reads cases from ./cases.ts, runs each one against the production model
 * via Gateway, evaluates property-based assertions, and diffs the outcome
 * against a committed baseline (./baseline.json). Catches real regressions
 * without trying to nail down non-deterministic exact strings.
 *
 * Usage:
 *   pnpm eval                                  # run all cases, diff vs baseline
 *   pnpm eval -- --only D2.1                   # narrow to one case
 *   pnpm eval -- --update                      # overwrite baseline with current outcomes
 *   pnpm eval -- --verbose                     # show full assistant text per case
 *
 * Tools are real (Supabase KB, Exa). No DB writes, no email sends — same
 * safety wall as scripts/test-instructions.ts. Each case uses a fresh
 * in-memory facts list.
 */

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import { AGENT_INSTRUCTIONS } from '../../src/lib/agent/instructions'
import { searchLcaKnowledge } from '../../src/lib/db/queries/lca-knowledge'
import { draftConnectEmail } from '../../src/lib/agent/connect-request'
import type { VisitorFact, VisitorFactCategory } from '../../src/lib/db/queries/visitor-facts'
import type { DbMessage } from '../../src/lib/db/queries/messages'
import { cases, resolveMessages, type EvalCase, type Expect } from './cases'

const MODEL = 'anthropic/claude-sonnet-4.5'
const EXA_API_URL = 'https://api.exa.ai'
const BASELINE_PATH = 'scripts/eval/baseline.json'

// ─── runtime state captured per case ──────────────────────────────────────

interface Trace {
  text: string
  toolCalls: string[]
  saveCount: number
  facts: VisitorFact[]
}

// ─── tool definitions (real impls; safe stubs for save / connect) ─────────

function buildTools(sessionId: string, trace: Trace, dbMessages: DbMessage[]): ToolSet {
  return {
    retrieve_lca_knowledge: tool({
      description: 'Search the curated LCA knowledge base (real Supabase).',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        trace.toolCalls.push('retrieve_lca_knowledge')
        try {
          const hits = await searchLcaKnowledge(query, 3)
          if (hits.length === 0) {
            return {
              found: false,
              results: [] as never[],
              note: 'No matching content found. Do not invent details — tell the visitor to email anthony@latecheckout.studio.',
            }
          }
          return {
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
        } catch (err) {
          return {
            found: false,
            results: [] as never[],
            note: `KB lookup failed: ${err instanceof Error ? err.message : String(err)}`,
          }
        }
      },
    }),
    fetch_website: tool({
      description: 'Fetch a public webpage via Exa.',
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => {
        trace.toolCalls.push('fetch_website')
        return await exaFetch(url)
      },
    }),
    search_web: tool({
      description: 'Web search via Exa.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        trace.toolCalls.push('search_web')
        return await exaSearch(query)
      },
    }),
    save_visitor_fact: tool({
      description: 'Save a visitor fact (in-memory only).',
      inputSchema: z.object({
        fact: z.string(),
        category: z.enum(['company', 'role', 'website', 'project', 'other']),
        source: z.string(),
      }),
      execute: async ({ fact, category, source }) => {
        trace.toolCalls.push('save_visitor_fact')
        trace.saveCount++
        const saved = makeFact(sessionId, fact, category, source)
        trace.facts.push(saved)
        return { saved: true, id: saved.id, fact, category, source }
      },
    }),
    propose_lca_connect: tool({
      description: 'Propose connecting the visitor with a human at LCA (UI button).',
      inputSchema: z.object({ reason: z.string() }),
      execute: async ({ reason }) => {
        trace.toolCalls.push('propose_lca_connect')
        return { proposed: true as const, reason }
      },
    }),
    offer_lca_connect: tool({
      description: 'Draft an intro email to LCA (real draftConnectEmail — no send).',
      inputSchema: z.object({ reason: z.string() }),
      execute: async ({ reason }) => {
        trace.toolCalls.push('offer_lca_connect')
        try {
          const draft = await draftConnectEmail({ messages: dbMessages, facts: trace.facts })
          return {
            ready: true as const,
            recipient: 'engineering@latecheckout.studio (not sent)',
            subject: draft.subject,
            body: draft.body,
            reason,
          }
        } catch (err) {
          return {
            ready: false as const,
            error: err instanceof Error ? err.message : String(err),
            reason,
          }
        }
      },
    }),
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

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

function buildSystemPrompt(facts: VisitorFact[]): string {
  const factsBlock =
    facts.length === 0
      ? 'No visitor facts saved yet.'
      : facts.map((f) => `- [${f.category}] ${f.fact} (source: ${f.source})`).join('\n')
  return `${AGENT_INSTRUCTIONS}

## Visitor facts — current source of truth

${factsBlock}`
}

async function exaFetch(url: string) {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return { success: false, url, content: '', error: 'EXA_API_KEY missing' }
  try {
    const res = await fetch(`${EXA_API_URL}/contents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ urls: [url], text: { maxCharacters: 6000 } }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { success: false, url, content: '', error: `Exa HTTP ${res.status}` }
    const json = (await res.json()) as { results?: Array<{ text?: string }> }
    const text = json.results?.[0]?.text ?? ''
    return text ? { success: true, url, content: text, error: null } : { success: false, url, content: '', error: 'no content' }
  } catch (err) {
    return { success: false, url, content: '', error: err instanceof Error ? err.message : String(err) }
  }
}

async function exaSearch(query: string) {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return { success: false as const, query, results: [], error: 'EXA_API_KEY missing' }
  try {
    const res = await fetch(`${EXA_API_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ query, type: 'auto', numResults: 5, contents: { text: { maxCharacters: 600 } } }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { success: false as const, query, results: [], error: `Exa HTTP ${res.status}` }
    const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; text?: string }> }
    const results = (json.results ?? []).slice(0, 5).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.text ?? '').slice(0, 600),
    }))
    return { success: true as const, query, results }
  } catch (err) {
    return { success: false as const, query, results: [], error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── core: run one case across multi-turn messages ────────────────────────

async function runCase(c: EvalCase): Promise<{ trace: Trace; turns: number }> {
  const sessionId = randomUUID()
  const facts: VisitorFact[] = []
  const dbMessages: DbMessage[] = []
  const modelMessages: ModelMessage[] = []
  const messages = resolveMessages(c)

  // Only the FINAL turn's trace is what we assert against. Earlier turns
  // get a throwaway trace; we reset it before the final turn.
  let trace: Trace = { text: '', toolCalls: [], saveCount: 0, facts }

  for (let i = 0; i < messages.length; i++) {
    const isFinalTurn = i === messages.length - 1
    if (isFinalTurn) trace = { text: '', toolCalls: [], saveCount: 0, facts }

    const userText = messages[i]
    modelMessages.push({ role: 'user', content: userText })
    dbMessages.push(makeDbMessage(sessionId, 'user', userText))

    const result = await generateText({
      model: MODEL,
      system: buildSystemPrompt(facts),
      messages: modelMessages,
      tools: buildTools(sessionId, trace, dbMessages),
      stopWhen: stepCountIs(8),
    })

    modelMessages.push(...result.response.messages)
    if (result.text) {
      dbMessages.push(makeDbMessage(sessionId, 'assistant', result.text))
      if (isFinalTurn) trace.text = result.text
    }
  }

  return { trace, turns: messages.length }
}

// ─── assertion evaluator ──────────────────────────────────────────────────

function countSentences(text: string): number {
  if (!text.trim()) return 0
  // crude but consistent: split on sentence-ending punctuation followed by whitespace
  const parts = text.trim().split(/[.!?]+\s+/).filter((s) => s.length > 0)
  // Trailing fragment with no terminator still counts as a sentence
  return parts.length
}

function evaluate(expect: Expect, trace: Trace): string[] {
  const failures: string[] = []
  const t = expect.text
  if (t) {
    const text = trace.text
    const lower = text.toLowerCase()
    if (t.nonEmpty && !text.trim()) failures.push('text was empty')
    if (t.includes) {
      for (const needle of t.includes) {
        if (!lower.includes(needle.toLowerCase())) failures.push(`text missing required substring: "${needle}"`)
      }
    }
    if (t.excludes) {
      for (const needle of t.excludes) {
        if (lower.includes(needle.toLowerCase())) failures.push(`text contained forbidden substring: "${needle}"`)
      }
    }
    if (t.matchesAny) {
      const ok = t.matchesAny.some((rx) => rx.test(text))
      if (!ok) failures.push(`text matched none of: ${t.matchesAny.map(String).join(' | ')}`)
    }
    if (t.maxSentences != null) {
      const n = countSentences(text)
      if (n > t.maxSentences) failures.push(`text was ${n} sentences (max ${t.maxSentences})`)
    }
  }
  const tl = expect.tools
  if (tl) {
    const set = new Set(trace.toolCalls)
    if (tl.includes) {
      for (const name of tl.includes) {
        if (!set.has(name)) failures.push(`tool "${name}" not called`)
      }
    }
    if (tl.excludes) {
      for (const name of tl.excludes) {
        if (set.has(name)) failures.push(`tool "${name}" was called but should not be`)
      }
    }
    if (tl.saveCount) {
      const { min, max } = tl.saveCount
      if (min != null && trace.saveCount < min)
        failures.push(`saved ${trace.saveCount} facts, expected at least ${min}`)
      if (max != null && trace.saveCount > max)
        failures.push(`saved ${trace.saveCount} facts, expected at most ${max}`)
    }
  }
  return failures
}

// ─── baseline / diff ──────────────────────────────────────────────────────

interface BaselineEntry {
  status: 'pass' | 'fail'
  failures: string[]
  lastChecked: string
}
type Baseline = Record<string, BaselineEntry>

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline
}

function writeBaseline(b: Baseline) {
  writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + '\n', 'utf8')
}

// ─── pretty printing ──────────────────────────────────────────────────────

const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

interface RunResult {
  c: EvalCase
  trace: Trace
  failures: string[]
  turns: number
}

function printResult(r: RunResult, verbose: boolean) {
  const mark = r.failures.length === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
  const id = r.c.id.padEnd(6)
  console.log(`${mark} ${id} ${DIM}${r.c.dimension}${RESET}  ${r.c.description}`)
  if (r.failures.length > 0) {
    for (const f of r.failures) console.log(`    ${RED}- ${f}${RESET}`)
    console.log(`    ${DIM}tools called: ${r.trace.toolCalls.join(', ') || '(none)'}${RESET}`)
    console.log(`    ${DIM}text: ${preview(r.trace.text)}${RESET}`)
  } else if (verbose) {
    console.log(`    ${DIM}tools: ${r.trace.toolCalls.join(', ') || '(none)'}${RESET}`)
    console.log(`    ${DIM}text: ${preview(r.trace.text, 400)}${RESET}`)
  }
}

function preview(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t || '(empty)'
}

function printSummary(results: RunResult[], baseline: Baseline | null) {
  const passed = results.filter((r) => r.failures.length === 0).length
  const failed = results.length - passed
  console.log()
  console.log(`${passed}/${results.length} passing.`)

  if (!baseline) {
    console.log(`${DIM}No baseline at ${BASELINE_PATH}. Run with --update to create one.${RESET}`)
    return
  }

  const regressions: string[] = []
  const fixes: string[] = []
  const newCases: string[] = []
  for (const r of results) {
    const before = baseline[r.c.id]
    const nowPass = r.failures.length === 0
    if (!before) {
      newCases.push(r.c.id)
      continue
    }
    if (before.status === 'pass' && !nowPass) regressions.push(r.c.id)
    if (before.status === 'fail' && nowPass) fixes.push(r.c.id)
  }
  if (regressions.length === 0 && fixes.length === 0 && newCases.length === 0) {
    console.log(`${DIM}No diff vs baseline.${RESET}`)
  } else {
    if (regressions.length > 0) console.log(`${RED}regressions:${RESET} ${regressions.join(', ')}`)
    if (fixes.length > 0) console.log(`${GREEN}fixes:${RESET} ${fixes.join(', ')}`)
    if (newCases.length > 0) console.log(`${YELLOW}new cases (not yet in baseline):${RESET} ${newCases.join(', ')}`)
    if (regressions.length === 0) {
      console.log(`${DIM}Run with --update to write the new outcomes to baseline.${RESET}`)
    }
  }
}

// ─── entrypoint ───────────────────────────────────────────────────────────

interface Args {
  update: boolean
  only: string | null
  verbose: boolean
}

function parseArgs(): Args {
  const raw = process.argv.slice(2)
  let only: string | null = null
  let update = false
  let verbose = false
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]
    if (a === '--update') update = true
    else if (a === '--verbose' || a === '-v') verbose = true
    else if (a === '--only') only = raw[++i] ?? null
  }
  return { update, only, verbose }
}

async function main() {
  const { update, only, verbose } = parseArgs()

  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error('AI_GATEWAY_API_KEY is not set. Add it to .env.local.')
    process.exit(1)
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Supabase env vars missing. retrieve_lca_knowledge will fail.')
    process.exit(1)
  }

  const filtered = only ? cases.filter((c) => c.id === only) : cases
  if (filtered.length === 0) {
    console.error(`No cases matched --only ${only}`)
    process.exit(1)
  }

  console.log(`Running ${filtered.length} case${filtered.length === 1 ? '' : 's'} against ${MODEL}…`)
  console.log()

  const results: RunResult[] = []
  for (const c of filtered) {
    try {
      const { trace, turns } = await runCase(c)
      const failures = evaluate(c.expect, trace)
      const r: RunResult = { c, trace, failures, turns }
      results.push(r)
      printResult(r, verbose)
    } catch (err) {
      const failures = [`runner error: ${err instanceof Error ? err.message : String(err)}`]
      const r: RunResult = {
        c,
        trace: { text: '', toolCalls: [], saveCount: 0, facts: [] },
        failures,
        turns: 0,
      }
      results.push(r)
      printResult(r, verbose)
    }
  }

  const baseline = loadBaseline()
  printSummary(results, baseline)

  if (update) {
    const next: Baseline = {}
    // Preserve any baseline entries we didn't re-run (e.g. with --only).
    if (baseline) Object.assign(next, baseline)
    for (const r of results) {
      next[r.c.id] = {
        status: r.failures.length === 0 ? 'pass' : 'fail',
        failures: r.failures,
        lastChecked: new Date().toISOString().slice(0, 10),
      }
    }
    writeBaseline(next)
    console.log(`baseline updated at ${BASELINE_PATH}`)
  }

  // Exit non-zero if any case fails when running without --update — makes
  // the runner usable as a CI gate.
  const anyFail = results.some((r) => r.failures.length > 0)
  if (!update && anyFail) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
