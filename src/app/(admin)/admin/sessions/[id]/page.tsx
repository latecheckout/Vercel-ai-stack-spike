import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionDetail } from '@/lib/db/queries/admin-sessions'

export const metadata = { title: 'Session detail — Admin' }
export const dynamic = 'force-dynamic'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getSessionDetail(id)
  if (!detail) notFound()

  const { session, messages, facts } = detail

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sessions" className="text-xs text-muted-foreground hover:underline">
          ← All sessions
        </Link>
        <h1 className="mt-1 font-mono text-lg">{session.id}</h1>
        <p className="text-xs text-muted-foreground">
          Mode <span className="font-mono">{session.mode}</span> · created{' '}
          {new Date(session.created_at).toLocaleString()} · updated{' '}
          {new Date(session.updated_at).toLocaleString()}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Rolling summary</h2>
        <div className="rounded-md border border-border/60 bg-card/40 p-4 text-sm whitespace-pre-wrap">
          {session.summary || (
            <span className="text-muted-foreground">No summary yet.</span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Visitor facts ({facts.length})
        </h2>
        {facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">None captured.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border/60">
            {facts.map((f) => (
              <li key={f.id} className="px-3 py-2 text-sm">
                <span className="rounded bg-accent/60 px-1.5 py-0.5 text-xs">{f.category}</span>{' '}
                <span>{f.fact}</span>
                <span className="ml-2 text-xs text-muted-foreground">via {f.source}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">
          Transcript ({messages.length})
        </h2>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-border/60 bg-card/40 p-3 text-sm whitespace-pre-wrap"
              >
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold uppercase">{m.role}</span>
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                {m.content}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
