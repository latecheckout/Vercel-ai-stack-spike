import Link from 'next/link'
import { listSessions } from '@/lib/db/queries/admin-sessions'

export const metadata = { title: 'Sessions — Admin' }
export const dynamic = 'force-dynamic'

export default async function SessionsListPage() {
  const sessions = await listSessions(100)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Read-only inspector. Visitor sessions contain real names, companies, and emails — keep
          this view to LCA staff only.
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-card/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Session</th>
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 font-medium">Messages</th>
              <th className="px-3 py-2 font-medium">Facts</th>
              <th className="px-3 py-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sessions.map((s) => {
              const last = s.last_message_at ?? s.updated_at
              return (
                <tr key={s.id} className="hover:bg-accent/40">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/admin/sessions/${s.id}`} className="hover:underline">
                      {s.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{s.mode}</td>
                  <td className="px-3 py-2 text-xs">{s.message_count}</td>
                  <td className="px-3 py-2 text-xs">{s.fact_count}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(last).toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {sessions.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                  No sessions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
