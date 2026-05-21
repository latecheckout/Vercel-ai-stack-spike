'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Hit = {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  source_url: string | null
  rank: number
}

export function PlaygroundClient() {
  const [query, setQuery] = useState('')
  const [k, setK] = useState(5)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('search_lca_knowledge', {
      q: query,
      max_results: k,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setHits((data ?? []) as Hit[])
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-md border border-border/60 bg-card/40 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="q">Query</Label>
          <Input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="tell me about grammarly" required />
        </div>
        <div className="w-24 space-y-2">
          <Label htmlFor="k">Limit</Label>
          <Input
            id="k"
            type="number"
            min={1}
            max={20}
            value={k}
            onChange={(e) => setK(Number(e.target.value) || 1)}
          />
        </div>
        <Button type="submit" disabled={loading || query.trim() === ''}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {hits && hits.length === 0 && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}

      {hits && hits.length > 0 && (
        <ol className="space-y-3">
          {hits.map((h, i) => (
            <li key={h.id} className="rounded-md border border-border/60 bg-card/40 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  #{i + 1} · rank {h.rank.toFixed(4)} · {h.category}
                </span>
                <Link href={`/admin/knowledge/${h.id}`} className="underline">
                  edit
                </Link>
              </div>
              <div className="font-medium">{h.title}</div>
              <div className="mt-1 line-clamp-3 text-xs text-muted-foreground whitespace-pre-wrap">
                {h.content.slice(0, 400)}
                {h.content.length > 400 && '…'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                tags: {h.tags.join(', ') || '—'}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
