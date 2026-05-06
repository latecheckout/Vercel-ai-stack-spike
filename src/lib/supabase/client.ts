import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

/**
 * Browser client for use in Client Components. Reads NEXT_PUBLIC_* envs.
 * Not actually consumed by the spike (DB access is server-only via API
 * routes), but kept to match LCA layout so future client-side queries
 * have a place to land.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
