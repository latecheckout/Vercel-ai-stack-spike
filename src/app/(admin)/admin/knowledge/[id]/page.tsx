import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getKnowledge } from '@/lib/db/queries/admin-knowledge'
import { KnowledgeForm } from '@/components/admin/knowledge-form'

export const metadata = { title: 'Edit knowledge — Admin' }
export const dynamic = 'force-dynamic'

export default async function EditKnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const row = await getKnowledge(id)
  if (!row) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/knowledge" className="text-xs text-muted-foreground hover:underline">
          ← All knowledge
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Edit knowledge row</h1>
        <p className="text-xs text-muted-foreground">
          Last updated {new Date(row.updated_at).toLocaleString()}
        </p>
      </div>
      <KnowledgeForm mode="edit" row={row} />
    </div>
  )
}
