import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/types/database'

export type AdminRow = Tables<'admins'> & { email: string | null }

/**
 * List every admin with their email joined from auth.users.
 *
 * auth.users isn't exposed via PostgREST, so we use the service-role
 * client to read just `id`/`email`. This page is only reachable for
 * users where `is_admin()` is true (the proxy enforces it), so leaking
 * those joined emails to the admin caller is fine — they're already
 * authorised to manage the admin pool.
 */
export async function listAdmins(): Promise<AdminRow[]> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('admins')
    .select('user_id, note, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listAdmins: ${error.message}`)
  if (!rows || rows.length === 0) return []

  const admin = createAdminClient()
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({
    perPage: 200,
  })
  if (usersError) throw new Error(`listAdmins.listUsers: ${usersError.message}`)

  const emailById = new Map(users.users.map((u) => [u.id, u.email ?? null]))
  return rows.map((row) => ({
    ...row,
    email: emailById.get(row.user_id) ?? null,
  }))
}
