import Link from 'next/link'
import { listKnowledge } from '@/lib/db/queries/admin-knowledge'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Knowledge — Admin' }
export const dynamic = 'force-dynamic'

export default async function KnowledgeListPage() {
  const rows = await listKnowledge()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge</h1>
          <p className="text-sm text-muted-foreground">
            Curated content the agent retrieves via <code>retrieve_lca_knowledge</code>.
          </p>
        </div>
        <Link href="/admin/knowledge/new">
          <Button>New row</Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Tags</th>
              <th className="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-accent/40">
                <td className="px-3 py-2">
                  <Link href={`/admin/knowledge/${row.id}`} className="font-medium hover:underline">
                    {row.title}
                  </Link>
                  {row.source_url && (
                    <div className="text-xs text-muted-foreground">{row.source_url}</div>
                  )}
                </td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.tags.join(', ')}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(row.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                  No knowledge yet. <Link href="/admin/knowledge/new" className="underline">Add the first row</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
