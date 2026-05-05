import { tool } from 'ai'
import { z } from 'zod'
import { Sandbox } from '@vercel/sandbox'

/**
 * Fetches and summarises a public URL the visitor has provided.
 *
 * Runs inside a Vercel Sandbox (Firecracker microVM) so arbitrary visitor URLs
 * cannot touch our app environment. The tool's execute function is annotated
 * with 'use step' so the Workflow DevKit makes this a retryable, observable
 * workflow step — if the fetch takes 20 seconds or the function restarts,
 * the step replays cleanly.
 *
 * Rules enforced:
 * - Only call with URLs the visitor explicitly gave you.
 * - Public sources only — no LinkedIn, no email enrichment.
 */
export const researchVisitor = tool({
  description:
    'Fetch and analyse a public URL that the visitor has explicitly provided. ' +
    'Runs in a secure sandbox. ' +
    "Before calling, tell the visitor: \"Give me a sec — reading your site.\" " +
    'Only call with URLs the visitor gave you. Public pages only.',
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .describe("The visitor's URL to fetch — must have been explicitly provided by the visitor"),
  }),
  execute: async ({ url }): Promise<ResearchResult> => {
    'use step' // WDK: makes this a retryable workflow step with full observability

    let sandbox: Sandbox | null = null

    try {
      sandbox = await Sandbox.create({
        runtime: 'node24',
        timeout: 45_000, // 45 s — generous for slow sites
        networkPolicy: 'allow-all', // We need egress to fetch visitor's URL
        resources: { vcpus: 1 }, // 2 GB RAM; lightweight fetch task
      })

      // Write the fetch+extract script to the sandbox filesystem
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
      return {
        success: false,
        url,
        content: '',
        error: err instanceof Error ? err.message : String(err),
      }
    } finally {
      if (sandbox) {
        await sandbox.stop().catch(() => undefined) // best-effort cleanup
      }
    }
  },
})

export type ResearchResult = {
  success: boolean
  url: string
  content: string
  error: string | null
}

/**
 * Build a self-contained ESM script that fetches the URL, strips HTML, and
 * prints a JSON object with the extracted text to stdout.
 */
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

  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' ' + res.statusText)
  }

  const html = await res.text()

  // Strip scripts, styles, and all HTML tags to get readable text
  const text = html
    .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, '')
    .replace(/<!--[\\s\\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 6000) // keep first 6K chars — usually captures the above-fold content

  process.stdout.write(JSON.stringify({ text }) + '\\n')
} catch (err) {
  process.stderr.write(String(err) + '\\n')
  process.exit(1)
}
`
}
