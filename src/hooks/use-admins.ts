'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ADMINS_KEY = ['admin', 'admins'] as const

/**
 * Add an admin by email. Calls the public.add_admin_by_email() SECURITY
 * DEFINER RPC because regular `authenticated` callers cannot select from
 * auth.users directly. The function raises with code P0002 when the email
 * isn't in auth.users — we translate that to a friendly message.
 */
export function useAddAdmin() {
  const router = useRouter()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, note }: { email: string; note?: string | null }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('add_admin_by_email', {
        p_email: email,
        p_note: note ?? undefined,
      })
      if (error) {
        if (error.code === 'P0002') {
          throw new Error(`No account exists for ${email}. Ask them to sign up first.`)
        }
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMINS_KEY })
      router.refresh()
    },
  })
}

export function useRemoveAdmin() {
  const router = useRouter()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('remove_admin', { p_user_id: userId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMINS_KEY })
      router.refresh()
    },
  })
}
