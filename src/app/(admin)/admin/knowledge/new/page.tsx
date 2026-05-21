import Link from 'next/link'
import { KnowledgeForm } from '@/components/admin/knowledge-form'

export const metadata = { title: 'New knowledge — Admin' }

export default function NewKnowledgePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/knowledge" className="text-xs text-muted-foreground hover:underline">
          ← All knowledge
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">New knowledge row</h1>
      </div>
      <KnowledgeForm mode="create" />
    </div>
  )
}
