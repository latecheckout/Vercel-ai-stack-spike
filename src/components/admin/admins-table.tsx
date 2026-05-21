'use client'

import { useState } from 'react'
import { useAddAdmin, useRemoveAdmin } from '@/hooks/use-admins'
import type { AdminRow } from '@/lib/db/queries/admins'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  admins: AdminRow[]
  currentUserId: string | null
}

export function AdminsTable({ admins, currentUserId }: Props) {
  const add = useAddAdmin()
  const remove = useRemoveAdmin()
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await add.mutateAsync({ email: email.trim(), note: note.trim() || null })
      setEmail('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onRemove(userId: string, label: string) {
    if (!window.confirm(`Remove ${label} from admins?`)) return
    try {
      await remove.mutateAsync(userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onAdd}
        className="flex flex-col gap-3 rounded-md border border-border/60 bg-card/40 p-4 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@latecheckout.studio"
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="admin-note">Note (optional)</Label>
          <Input
            id="admin-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ops"
          />
        </div>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add admin'}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="px-3 py-2 font-medium">Added</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {admins.map((a) => {
              const isSelf = a.user_id === currentUserId
              const label = a.email ?? a.user_id
              return (
                <tr key={a.user_id}>
                  <td className="px-3 py-2">
                    {a.email ?? <span className="text-muted-foreground">(no email)</span>}
                    {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{a.note ?? ''}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSelf || remove.isPending}
                      onClick={() => onRemove(a.user_id, label)}
                      title={isSelf ? "You can't remove yourself" : undefined}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
