/**
 * OpenAI moderation gate for inbound user messages.
 *
 * Runs in parallel with the workflow stream from the chat route handler
 * (not from inside the workflow — the flow worker has no `fetch`/AbortSignal,
 * see AGENTS.md). On a positive classification the route cancels the run,
 * stops forwarding agent chunks, and emits a redact signal to the client.
 *
 * Fail-open: if `OPENAI_API_KEY` is missing or the call errors, we treat the
 * message as clean. The spike already follows this pattern for Exa/Resend —
 * better to ship a flaky-network turn than to suppress legit responses.
 */

const MODERATION_URL = 'https://api.openai.com/v1/moderations'
const MODERATION_MODEL = 'omni-moderation-latest'
const MODERATION_TIMEOUT_MS = 8_000

export type ModerationResult =
  | { flagged: false }
  | { flagged: true; categories: string[] }

export async function moderateText(text: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[moderation] OPENAI_API_KEY not set — skipping (fail-open)')
    return { flagged: false }
  }

  const trimmed = text.trim()
  if (trimmed.length === 0) return { flagged: false }

  try {
    const res = await fetch(MODERATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: MODERATION_MODEL, input: trimmed }),
      signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.warn(`[moderation] HTTP ${res.status} — failing open`)
      return { flagged: false }
    }

    const json = (await res.json()) as {
      results?: Array<{
        flagged?: boolean
        categories?: Record<string, boolean>
      }>
    }

    const first = json.results?.[0]
    if (!first?.flagged) return { flagged: false }

    const categories = Object.entries(first.categories ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k)

    return { flagged: true, categories }
  } catch (err) {
    console.warn('[moderation] request failed — failing open:', err)
    return { flagged: false }
  }
}

export const MODERATION_REFUSAL_TEXT =
  "I can't help with that. Let's keep the conversation focused on LCA — what are you working on?"
