/**
 * Durable step functions for the chat workflow.
 *
 * Each function is marked `'use step'` and gets compiled into an isolated API
 * route by the Workflow SDK — inputs and outputs are recorded so the workflow
 * can replay deterministically. Per the SDK docs, splitting steps out of the
 * workflow file is supported and avoids most bundler-related issues.
 *
 * The workflow itself (and the AI SDK tool wrappers that call these) lives in
 * `./index.ts`. Pure helpers used only inside a single step (e.g. URL
 * validation, HTML stripping) sit at the bottom of this file.
 */

import { extendSummary } from '../summary'
import { draftConnectEmail, type ConnectDraft } from '../connect-request'
import { saveMessage, getMessages } from '../../db/queries/messages'
import {
  getSession,
  updateSessionSummary,
  type SessionMode,
} from '../../db/queries/sessions'
import {
  saveVisitorFact as dbSaveVisitorFact,
  getVisitorFacts as dbGetVisitorFacts,
  type VisitorFact,
  type VisitorFactCategory,
} from '../../db/queries/visitor-facts'
import {
  searchLcaKnowledge as dbSearchLcaKnowledge,
  type LcaKnowledgeHit,
} from '../../db/queries/lca-knowledge'

export interface SessionRuntimeState {
  mode: SessionMode
  summary: string
}

// ─── Session / facts / persistence ─────────────────────────────────────────

export async function persistAssistantMessage(chatId: string, text: string) {
  'use step'
  await saveMessage(chatId, 'assistant', text).catch(() => undefined)
}

export async function loadVisitorFacts(sessionId: string): Promise<VisitorFact[]> {
  'use step'
  try {
    return await dbGetVisitorFacts(sessionId)
  } catch (err) {
    console.error('[loadVisitorFacts] failed', err)
    return []
  }
}

export async function loadSessionState(
  sessionId: string,
): Promise<SessionRuntimeState> {
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

export async function extendSummaryStep(
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

export async function persistVisitorFact(
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

// ─── Connect-request draft (LCA intro flow) ────────────────────────────────

export type DraftConnectResult =
  | { ok: true; subject: string; body: string }
  | { ok: false; error: string }

/**
 * Build the subject + body the visitor will see prefilled in the connect
 * card. Loads the transcript and current facts inside the step so the
 * model gets the freshest context (the visitor may have just deleted a
 * fact via the panel — same reasoning as `extendSummaryStep`).
 */
export async function draftConnectRequestStep(
  sessionId: string,
): Promise<DraftConnectResult> {
  'use step'

  try {
    const [messages, facts] = await Promise.all([
      getMessages(sessionId),
      dbGetVisitorFacts(sessionId),
    ])

    if (messages.length === 0) {
      return {
        ok: false,
        error: 'No conversation yet — nothing to draft from.',
      }
    }

    const draft: ConnectDraft = await draftConnectEmail({ messages, facts })
    return { ok: true, subject: draft.subject, body: draft.body }
  } catch (err) {
    console.error('[draftConnectRequestStep] failed', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Knowledge / web retrieval ─────────────────────────────────────────────

export async function searchLcaKnowledgeStep(
  query: string,
): Promise<LcaKnowledgeHit[]> {
  'use step'

  try {
    return await dbSearchLcaKnowledge(query, 3)
  } catch (err) {
    console.error('[retrieve_lca_knowledge] failed', err)
    return []
  }
}

// Both web tools route through Exa: /search returns ranked results with
// snippet text, /contents extracts a full page for a known URL. Exa handles
// crawling, HTML→text, and the SSRF surface server-side, so neither step
// needs its own fetch + HTML strip + URL validator.
const EXA_API_URL = 'https://api.exa.ai'

export type FetchResult = {
  success: boolean
  url: string
  content: string
  error: string | null
}

export async function fetchPublicWebsite(url: string): Promise<FetchResult> {
  'use step'

  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return {
      success: false,
      url,
      content: '',
      error:
        'Website fetch is not configured (EXA_API_KEY missing). Tell the visitor you cannot read pages right now.',
    }
  }

  try {
    const res = await fetch(`${EXA_API_URL}/contents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        urls: [url],
        text: { maxCharacters: 6000 },
      }),
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
    console.error('[fetch_website] failed', err)
    return {
      success: false,
      url,
      content: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export type WebSearchHit = {
  title: string
  url: string
  snippet: string
}

export type WebSearchResult =
  | { success: true; query: string; results: WebSearchHit[] }
  | { success: false; query: string; results: never[]; error: string }

export async function searchWeb(query: string): Promise<WebSearchResult> {
  'use step'

  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return {
      success: false,
      query,
      results: [],
      error:
        'Web search is not configured (EXA_API_KEY missing). Tell the visitor you cannot search the web right now.',
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
        contents: {
          text: { maxCharacters: 600 },
        },
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

    const results: WebSearchHit[] = (json.results ?? []).slice(0, 5).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.text ?? '').slice(0, 600),
    }))

    return { success: true, query, results }
  } catch (err) {
    console.error('[search_web] failed', err)
    return {
      success: false,
      query,
      results: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
