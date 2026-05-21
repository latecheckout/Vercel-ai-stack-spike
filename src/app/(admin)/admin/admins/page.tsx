import { listAdmins } from '@/lib/db/queries/admins'
import { createClient } from '@/lib/supabase/server'
import { AdminsTable } from '@/components/admin/admins-table'

export const metadata = { title: 'Admins — Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminsPage() {
  const [admins, supabase] = await Promise.all([listAdmins(), createClient()])
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admins</h1>
        <p className="text-sm text-muted-foreground">
          Everyone in this list can read and write privileged data via /admin/*. Add by email after
          the person has signed up.
        </p>
      </div>
      <AdminsTable admins={admins} currentUserId={user?.id ?? null} />
    </div>
  )
}
