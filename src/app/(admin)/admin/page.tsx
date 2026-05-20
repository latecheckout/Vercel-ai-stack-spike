import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Admin dashboard' }

async function getCounts() {
  const supabase = await createClient()
  const [knowledge, sessions, messages, facts, admins] = await Promise.all([
    supabase.from('lca_knowledge').select('id', { count: 'exact', head: true }),
    supabase.from('sessions').select('id', { count: 'exact', head: true }),
    supabase.from('messages').select('id', { count: 'exact', head: true }),
    supabase.from('visitor_facts').select('id', { count: 'exact', head: true }),
    supabase.from('admins').select('user_id', { count: 'exact', head: true }),
  ])
  return {
    knowledge: knowledge.count ?? 0,
    sessions: sessions.count ?? 0,
    messages: messages.count ?? 0,
    facts: facts.count ?? 0,
    admins: admins.count ?? 0,
  }
}

export default async function AdminDashboardPage() {
  const counts = await getCounts()
  const cards = [
    { label: 'Knowledge rows', value: counts.knowledge, href: '/admin/knowledge' },
    { label: 'Chat sessions', value: counts.sessions, href: '/admin/sessions' },
    { label: 'Messages', value: counts.messages, href: '/admin/sessions' },
    { label: 'Visitor facts', value: counts.facts, href: '/admin/sessions' },
    { label: 'Admins', value: counts.admins, href: '/admin/admins' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-md border border-border/60 bg-card/40 p-4 hover:bg-accent/40"
          >
            <div className="text-2xl font-semibold">{card.value}</div>
            <div className="text-xs text-muted-foreground">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
