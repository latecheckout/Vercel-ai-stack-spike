import { tool } from 'ai'
import { z } from 'zod'
import { saveVisitorFact as dbSaveVisitorFact } from '@/lib/db/queries/visitor-facts'

const CATEGORIES = ['company', 'role', 'website', 'project', 'other'] as const

/**
 * Factory: returns a save_visitor_fact tool bound to the current session.
 * Call once per chat turn and pass to DurableAgent's tools map.
 */
export function makeSaveVisitorFactTool(sessionId: string) {
  return tool({
    description:
      'Save a fact you have learned about the visitor to the database. ' +
      'Call this each time the visitor confirms new information about themselves. ' +
      'The fact will appear in the "What LCA knows about you" panel immediately.',
    inputSchema: z.object({
      fact: z.string().describe('The specific fact — concise, one sentence'),
      category: z
        .enum(CATEGORIES)
        .describe(
          'company | role | website | project | other — pick the most specific category',
        ),
      source: z
        .string()
        .describe(
          'How this was obtained: "visitor stated", "from website example.com", etc.',
        ),
    }),
    execute: async ({ fact, category, source }) => {
      'use step' // WDK: retryable step — safe to retry DB inserts (idempotency via fact text)

      try {
        const saved = await dbSaveVisitorFact(sessionId, fact, category, source)
        return { saved: true, id: saved.id, fact, category, source }
      } catch (err) {
        // Don't fail the whole agent turn if the DB write fails
        return {
          saved: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  })
}
