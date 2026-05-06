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
import { Sandbox } from '@vercel/sandbox'
import type { ModelMessage, UIMessageChunk } from 'ai'
import { AGENT_INSTRUCTIONS } from './instructions'
import { retrieveLcaKnowledge } from './tools/retrieve-lca-knowledge'
import { saveMessage } from '../db/queries/messages'
import {
  saveVisitorFact as dbSaveVisitorFact,
  type VisitorFactCategory,
} from '../db/queries/visitor-facts'

// ─── Workflow ──────────────────────────────────────────────────────────────

export async function runChatWorkflow(chatId: string, messages: ModelMessage[]) {
  'use workflow'

  const writable = getWritable<UIMessageChunk>()

  const agent = new DurableAgent({
    model: 'anthropic/claude-sonnet-4.5',
    instructions: AGENT_INSTRUCTIONS,
    tools: {
      retrieve_lca_knowledge: retrieveLcaKnowledge,
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

// ─── Steps ─────────────────────────────────────────────────────────────────

async function persistAssistantMessage(chatId: string, text: string) {
  'use step'
  await saveMessage(chatId, 'assistant', text).catch(() => undefined)
}

type ResearchResult = {
  success: boolean
  url: string
  content: string
  error: string | null
}

async function fetchVisitorSite(url: string): Promise<ResearchResult> {
  'use step'

  let sandbox: Sandbox | null = null
  try {
    sandbox = await Sandbox.create({
      runtime: 'node24',
      timeout: 45_000,
      networkPolicy: 'allow-all',
      resources: { vcpus: 1 },
    })

    const script = buildFetchScript(url)
    await sandbox.fs.writeFile('/tmp/fetch.mjs', script)

    const cmd = await sandbox.runCommand({
      cmd: 'node',
      args: ['/tmp/fetch.mjs'],
      detached: true,
    })

    let stdout = ''
    let stderr = ''
    for await (const log of cmd.logs()) {
      if (log.stream === 'stdout') stdout += log.data
      else stderr += log.data
    }
    const { exitCode } = await cmd.wait()

    if (exitCode !== 0) {
      return {
        success: false,
        url,
        content: '',
        error: `Fetch process exited ${exitCode}: ${stderr.slice(0, 500)}`,
      }
    }

    const parsed = JSON.parse(stdout.trim()) as { text: string }
    return { success: true, url, content: parsed.text, error: null }
  } catch (err) {
    console.error('[research_visitor] failed', err)
    return {
      success: false,
      url,
      content: '',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    if (sandbox) await sandbox.stop().catch(() => undefined)
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

// ─── Tool wrappers (NOT steps) ─────────────────────────────────────────────

function makeResearchVisitorTool() {
  return tool({
    description:
      'Fetch and analyse a public URL that the visitor has explicitly provided. ' +
      'Runs in a secure sandbox. ' +
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

function buildFetchScript(url: string): string {
  const safeUrl = JSON.stringify(url)
  return `
const url = ${safeUrl}

try {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'LCA-Research-Bot/1.0 (reading your site as requested in chat)',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
    },
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
  })

  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText)

  const html = await res.text()
  const text = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, '')
    .replace(/<!--[\\s\\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 6000)

  process.stdout.write(JSON.stringify({ text }) + '\\n')
} catch (err) {
  process.stderr.write(String(err) + '\\n')
  process.exit(1)
}
`
}
