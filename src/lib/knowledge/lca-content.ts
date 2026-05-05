/**
 * Curated LCA knowledge base.
 *
 * This is the ONLY source of truth for facts about LCA that the agent is
 * allowed to state. The agent must call `retrieve_lca_knowledge` before
 * answering any factual question about LCA — it may not invent details.
 *
 * For the spike: keyword-scored BM25-style search.
 * For production: embed each item with text-embedding-3-small via AI Gateway
 *   and store in Supabase with pgvector for cosine similarity search.
 */

export type KnowledgeItem = {
  id: string
  title: string
  content: string
  category: 'service' | 'case-study' | 'approach' | 'engagement' | 'faq'
  tags: string[]
}

export const LCA_KNOWLEDGE: KnowledgeItem[] = [
  // ── Services ────────────────────────────────────────────────────────────────
  {
    id: 'svc-ai-product',
    title: 'AI Product Engineering',
    category: 'service',
    tags: ['product', 'build', 'mvp', 'full-stack', 'engineering'],
    content: `LCA builds AI-powered products end-to-end — from architecture to deployment.
We take companies from idea to working software, owning the full technical stack.
Typical engagements: 6–12 weeks, delivering a production-grade system the team can
own and extend. We specialise in products where AI is the core differentiator, not
a bolt-on. If you need a co-pilot, agent, or AI-driven workflow that has to actually
work in production (not just demo well), that is our sweet spot.`,
  },
  {
    id: 'svc-rag',
    title: 'RAG Systems & Knowledge Bases',
    category: 'service',
    tags: ['rag', 'retrieval', 'knowledge', 'vector', 'embeddings', 'search', 'documents'],
    content: `LCA designs and builds Retrieval-Augmented Generation (RAG) systems that let
LLMs answer questions from your proprietary data — documents, databases, internal
wikis, PDFs, codebases. We go beyond naive chunking: we think carefully about
retrieval quality, embedding strategy, re-ranking, and guardrails that prevent the
model hallucinating outside the source material. Delivered with observability so
you can see exactly what context drove each answer.`,
  },
  {
    id: 'svc-agents',
    title: 'AI Agents & Automation',
    category: 'service',
    tags: ['agent', 'automation', 'workflow', 'tools', 'agentic', 'autonomous'],
    content: `LCA builds autonomous agents that take multi-step actions across your systems —
calling APIs, reading and writing data, making decisions, and looping until a task
is complete. We use the Vercel AI SDK with durable execution (Workflow DevKit) for
agents that need to run for minutes or hours without failing. Common use cases:
research assistants, data extraction pipelines, customer triage agents, internal
ops automation. We instrument everything so you can replay and audit exactly what
the agent did.`,
  },
  {
    id: 'svc-audit',
    title: 'AI Strategy & Technical Audits',
    category: 'service',
    tags: ['audit', 'strategy', 'advisory', 'review', 'assessment', 'consultant'],
    content: `LCA offers short-form engagements (1–2 weeks) to review your existing AI
investment: evaluating model choices, prompt engineering, retrieval quality,
infrastructure costs, and team setup. We deliver a written assessment with a
prioritised roadmap. Useful for teams who have shipped something but are not sure
if they built it right, or who want a second opinion before committing to a stack.`,
  },

  // ── Case Studies ────────────────────────────────────────────────────────────
  {
    id: 'cs-legal',
    title: 'Case Study: Legal Document Analysis',
    category: 'case-study',
    tags: ['legal', 'documents', 'analysis', 'review', 'law firm', 'contract'],
    content: `A mid-size law firm needed to accelerate contract review for due-diligence work.
LCA built a RAG system over their document library (10K+ contracts) with a
specialist review UI. Associates could ask natural-language questions ("what is the
termination clause in the Acme MSA?") and get cited, grounded answers in seconds.
Result: ~70% reduction in time-to-first-answer during due diligence. The system
handled 150K queries in its first quarter with zero hallucinated citations.`,
  },
  {
    id: 'cs-fintech',
    title: 'Case Study: Fintech Customer Service Agent',
    category: 'case-study',
    tags: ['fintech', 'customer service', 'support', 'agent', 'payments', 'banking'],
    content: `A fintech startup handling 12K monthly support tickets needed to scale without
proportional headcount growth. LCA built a triage and resolution agent: it
classifies incoming tickets, resolves ~65% autonomously (refunds, KYC queries,
account lookups via tool calls), and routes the rest to a human with full context.
The agent runs as a durable Workflow so it can wait on external API calls — up to
90-second SLA for partner bank responses — without holding a serverless function
open. Median resolution time dropped from 8h to 4 minutes for automated cases.`,
  },
  {
    id: 'cs-ecom',
    title: 'Case Study: E-commerce AI Co-pilot',
    category: 'case-study',
    tags: ['e-commerce', 'retail', 'recommendations', 'personalisation', 'shopping'],
    content: `An e-commerce brand wanted a smarter shopping assistant — one that could engage
with intent ("I need running shoes for a half marathon in October") rather than
pure keyword search. LCA built a conversational product discovery system grounded
in the client's catalogue and inventory. The assistant asks clarifying questions,
narrows the catalogue, explains trade-offs, and hands off to checkout with a
pre-filled cart. Average order value in sessions using the assistant was 28% higher
than unaided search in A/B testing over 60 days.`,
  },

  // ── Approach ────────────────────────────────────────────────────────────────
  {
    id: 'approach-production-first',
    title: 'Our Approach: Production-First Engineering',
    category: 'approach',
    tags: ['approach', 'production', 'engineering', 'quality', 'standards', 'methodology'],
    content: `LCA does not build demos. Everything we ship is designed to run in production:
TypeScript strict mode, comprehensive error handling, observability from day one,
and deployment pipelines before any code touches a staging environment. Our
engineering standards — AGENTS.md, kebab-case filenames, Server Components by
default, declarative database schemas — are applied consistently across every
project. This means hand-off is real: the team inheriting the system can read,
change, and debug it without us in the room.`,
  },
  {
    id: 'approach-small-senior',
    title: 'Our Approach: Small and Senior',
    category: 'approach',
    tags: ['team', 'small', 'senior', 'engineers', 'boutique', 'people'],
    content: `LCA is a small studio — deliberately. We do not staff engagements with juniors
supervised by seniors. The engineers who scope the work are the engineers who
build it. This means faster feedback loops, lower coordination overhead, and
higher accountability. We take on a limited number of concurrent engagements so
we can be fully present for each client.`,
  },
  {
    id: 'approach-stack',
    title: 'Our Default Stack',
    category: 'approach',
    tags: ['stack', 'technology', 'next.js', 'vercel', 'supabase', 'typescript', 'react'],
    content: `LCA's default stack: Next.js (App Router), TypeScript strict mode, Tailwind +
shadcn/ui, Supabase (Postgres + pgvector + RLS), Vercel (AI Gateway, Workflow
DevKit, Sandbox). We pick this stack because every layer is production-battle-tested
and the team knows it cold. When a project has a specific constraint (different
cloud, different DB), we adapt — but we start from this base and deviate only when
there is a clear reason.`,
  },

  // ── Engagement ──────────────────────────────────────────────────────────────
  {
    id: 'engage-project',
    title: 'Engagement: Project-Based',
    category: 'engagement',
    tags: ['engagement', 'project', 'scope', 'fixed', 'price', 'timeline', 'how to work'],
    content: `Most LCA engagements are project-based: a defined scope, a fixed timeline (usually
6–12 weeks), and a clear deliverable. We start with a 2-day scoping session where
we map your existing systems, define the success criteria, and agree a technical
plan. Pricing is based on scope and complexity. We do not do time-and-materials;
we agree scope upfront and hold to it. Contact anthony@latecheckout.studio to
discuss your project.`,
  },
  {
    id: 'engage-retainer',
    title: 'Engagement: Retainer',
    category: 'engagement',
    tags: ['retainer', 'ongoing', 'continuous', 'monthly', 'partnership'],
    content: `For companies that want ongoing AI development capacity, LCA offers a monthly
retainer. A fixed number of engineering days per month, flexible across strategic
and execution work. Retainer clients get priority scheduling and same-week response
on new requests. This works well for teams shipping AI features continuously —
companies that have validated the value of AI and need a reliable technical partner
to keep moving fast.`,
  },

  // ── FAQ ─────────────────────────────────────────────────────────────────────
  {
    id: 'faq-who',
    title: 'FAQ: Who is LCA right for?',
    category: 'faq',
    tags: ['who', 'fit', 'ideal', 'customer', 'right', 'client', 'company'],
    content: `LCA works best with:
• B2B SaaS companies (seed–Series B) who want AI embedded in their product.
• Enterprises running a contained AI initiative who need senior technical execution,
  not a large consultancy.
• Founders who have validated a problem and need a technical partner to build
  the AI layer fast and correctly.

LCA is probably not the right fit if you need a large team (10+ engineers), pure
data-science work (model training, fine-tuning), or a vendor selling a packaged
AI product rather than custom engineering.`,
  },
  {
    id: 'faq-contact',
    title: 'FAQ: How to get in touch',
    category: 'faq',
    tags: ['contact', 'email', 'talk', 'start', 'reach out', 'hire', 'work with'],
    content: `The fastest way to start a conversation with LCA is email:
anthony@latecheckout.studio. We respond within one business day. If you prefer,
you can also use this chat — tell us what you're building, share your website,
and we'll have a substantive conversation right here. We do not do sales calls
before understanding the problem; we'd rather spend that time actually talking
about your project.`,
  },
]

// ── Keyword search (BM25-lite) ───────────────────────────────────────────────
// For the spike. Replace with pgvector cosine search for production.

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function scoreItem(item: KnowledgeItem, queryTokens: string[]): number {
  const haystack = tokenise(`${item.title} ${item.content} ${item.tags.join(' ')}`)
  const haystackSet = new Set(haystack)

  // Simple term-frequency score: count unique matching tokens + double-weight tags
  let score = 0
  for (const token of queryTokens) {
    if (haystackSet.has(token)) score += 1
    if (item.tags.includes(token)) score += 1 // bonus for tag match
  }
  return score
}

export function searchKnowledge(query: string, limit = 3): KnowledgeItem[] {
  const queryTokens = tokenise(query)
  if (queryTokens.length === 0) return []

  return LCA_KNOWLEDGE.map((item) => ({ item, score: scoreItem(item, queryTokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item)
}
