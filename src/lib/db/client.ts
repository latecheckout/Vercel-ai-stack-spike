import { createClient } from '@supabase/supabase-js'

// Public (anon) client — used in Server Components and API routes for
// operations that go through RLS. Safe to use with the anon key.
export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars. ' +
        'Copy .env.local.example to .env.local and fill in your Supabase credentials.',
    )
  }

  return createClient(url, key)
}

// Service-role client — bypasses RLS. Only use in trusted server contexts
// (e.g., seeding the knowledge base). Never expose to the client.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.',
    )
  }

  return createClient(url, key)
}
