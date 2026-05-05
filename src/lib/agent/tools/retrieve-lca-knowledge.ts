import { tool } from 'ai'
import { z } from 'zod'
import { searchKnowledge } from '@/lib/knowledge/lca-content'

/**
 * Searches the curated LCA knowledge base and returns the most relevant chunks.
 * The agent must call this before making any factual claim about LCA.
 *
 * Spike: keyword search.
 * Production: replace searchKnowledge() with a Supabase pgvector cosine query
 *   using embed() from the AI SDK via AI Gateway (openai/text-embedding-3-small).
 */
export const retrieveLcaKnowledge = tool({
  description:
    'Search the curated LCA knowledge base for approved content about services, ' +
    'case studies, approach, pricing, and capabilities. ' +
    'Always call this before making any factual statement about LCA.',
  inputSchema: z.object({
    query: z.string().describe('Natural-language question or topic to look up'),
  }),
  execute: async ({ query }) => {
    const results = searchKnowledge(query, 3)

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
      })),
      note: undefined as string | undefined,
    }
  },
})
