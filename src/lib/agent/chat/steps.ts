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

export type FetchResult = {
  success: boolean
  url: string
  content: string
  error: string | null
}

export async function fetchPublicWebsite(url: string): Promise<FetchResult> {
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

export type WebSearchHit = {
  title: string
  url: string
  snippet: string
}

export type WebSearchResult =
  | { success: true; query: string; results: WebSearchHit[]; answer: string | null }
  | { success: false; query: string; results: never[]; answer: null; error: string }

export async function searchWeb(query: string): Promise<WebSearchResult> {
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
      answer:
        typeof json.answer === 'string' && json.answer.length > 0 ? json.answer : null,
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

// ─── Step-internal helpers ─────────────────────────────────────────────────

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
