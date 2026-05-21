import { PlaygroundClient } from '@/components/admin/playground-client'

export const metadata = { title: 'FTS playground — Admin' }

export default function PlaygroundPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge playground</h1>
        <p className="text-sm text-muted-foreground">
          Send a query through <code>search_lca_knowledge</code> — the same SQL function the agent
          calls via <code>retrieve_lca_knowledge</code> — and inspect the ranked hits. Useful for
          tuning titles, tags, and content.
        </p>
      </div>
      <PlaygroundClient />
    </div>
  )
}
