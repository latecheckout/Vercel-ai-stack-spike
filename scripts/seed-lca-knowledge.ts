/**
 * Seed `public.lca_knowledge` from latecheckout.agency.
 *
 * Run with:
 *   pnpm db:seed-knowledge
 *
 * Idempotent: rows are upserted by `source_url`. Re-running refreshes
 * content but keeps existing IDs.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/lib/database.types'

const ORIGIN = 'https://latecheckout.agency'

type SeedTarget = {
  path: string
  category: 'overview' | 'case-study' | 'guide' | 'careers'
  tags: string[]
}

// /contact-us is intentionally omitted — the page is client-rendered and a
// plain fetch returns the JS shell ("Loading..."). The agent's system prompt
// covers the contact email directly, so no row is needed in the knowledge base.
const TARGETS: SeedTarget[] = [
  { path: '/', category: 'overview', tags: ['lca', 'overview', 'studio', 'ai', 'design'] },
  {
    path: '/our-work/dropbox',
    category: 'case-study',
    tags: ['case-study', 'dropbox', 'ai', 'product'],
  },
  {
    path: '/our-work/grammarly',
    category: 'case-study',
    tags: ['case-study', 'grammarly', 'ai', 'product'],
  },
  {
    path: '/our-work/salesforce',
    category: 'case-study',
    tags: ['case-study', 'salesforce', 'agent', 'ai'],
  },
  {
    path: '/ai-field-guide',
    category: 'guide',
    tags: ['guide', 'ai', 'field-guide', 'education'],
  },
  { path: '/careers', category: 'careers', tags: ['careers', 'jobs', 'hiring', 'culture'] },
]

const MAX_CONTENT_CHARS = 8000
// Pages shorter than this after stripping are almost certainly JS-rendered
// shells. Skip rather than poison the index with "Loading...".
const MIN_CONTENT_CHARS = 200

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with `tsx --env-file=.env.local scripts/seed-lca-knowledge.ts`.',
    )
  }

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const rows: Database['public']['Tables']['lca_knowledge']['Insert'][] = []

  for (const target of TARGETS) {
    const sourceUrl = `${ORIGIN}${target.path}`
    process.stdout.write(`  → fetching ${sourceUrl} … `)
    const scraped = await scrapePage(sourceUrl)
    if (!scraped) {
      console.log('SKIP (empty)')
      continue
    }
    rows.push({
      title: scraped.title,
      content: scraped.content,
      category: target.category,
      tags: target.tags,
      source_url: sourceUrl,
    })
    console.log(`ok (${scraped.content.length} chars)`)
  }

  if (rows.length === 0) {
    throw new Error('No pages scraped — refusing to wipe the table.')
  }

  console.log(`\nUpserting ${rows.length} rows …`)
  const { error } = await supabase
    .from('lca_knowledge')
    .upsert(rows, { onConflict: 'source_url' })

  if (error) throw new Error(`Upsert failed: ${error.message}`)
  console.log('Done.')
}

type Scraped = { title: string; content: string }

async function scrapePage(url: string): Promise<Scraped | null> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'LCA-KnowledgeBase-Seeder/1.0 (anthony@latecheckout.studio)',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    console.log(`HTTP ${res.status}`)
    return null
  }
  const html = await res.text()
  const title = extractTitle(html) ?? url
  const content = stripHtml(html).slice(0, MAX_CONTENT_CHARS).trim()
  if (content.length < MIN_CONTENT_CHARS) {
    console.log(`SKIP (only ${content.length} chars; likely JS-rendered)`)
    return null
  }
  return { title, content }
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
  if (og?.[1]) return decodeEntities(og[1].trim())
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (t?.[1]) return decodeEntities(t[1].trim())
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1?.[1]) return decodeEntities(stripTags(h1[1]).trim())
  return null
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
