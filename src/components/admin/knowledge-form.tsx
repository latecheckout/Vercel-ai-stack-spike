'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCreateKnowledge, useDeleteKnowledge, useUpdateKnowledge } from '@/hooks/use-admin-knowledge'
import { KNOWLEDGE_CATEGORIES, type KnowledgeRow } from '@/lib/db/queries/admin-knowledge-shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Props =
  | { mode: 'create'; row?: undefined }
  | { mode: 'edit'; row: KnowledgeRow }

export function KnowledgeForm(props: Props) {
  const router = useRouter()
  const create = useCreateKnowledge()
  const update = useUpdateKnowledge()
  const remove = useDeleteKnowledge()
  const editing = props.mode === 'edit' ? props.row : null

  const [title, setTitle] = useState(editing?.title ?? '')
  const [category, setCategory] = useState<string>(editing?.category ?? 'overview')
  const [tags, setTags] = useState((editing?.tags ?? []).join(', '))
  const [sourceUrl, setSourceUrl] = useState(editing?.source_url ?? '')
  const [content, setContent] = useState(editing?.content ?? '')
  const [error, setError] = useState<string | null>(null)

  const pending = create.isPending || update.isPending || remove.isPending

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = {
      title: title.trim(),
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      source_url: sourceUrl.trim() || null,
      content,
    }
    try {
      if (props.mode === 'create') {
        const inserted = await create.mutateAsync(payload)
        router.replace(`/admin/knowledge/${inserted.id}`)
      } else {
        await update.mutateAsync({ id: props.row.id, patch: payload })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDelete() {
    if (props.mode !== 'edit') return
    if (!window.confirm('Delete this knowledge row? This cannot be undone.')) return
    try {
      await remove.mutateAsync(props.row.id)
      router.replace('/admin/knowledge')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="case-study, ai" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="source_url">Source URL</Label>
          <Input
            id="source_url"
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://latecheckout.agency/…"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="content">Content</Label>
          <Textarea
            id="content"
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[260px] font-mono text-xs"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : props.mode === 'create' ? 'Create' : 'Save'}
        </Button>
        {props.mode === 'edit' && (
          <Button type="button" variant="destructive" disabled={pending} onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </form>
  )
}
