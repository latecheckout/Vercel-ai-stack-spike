'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { KnowledgeInsert, KnowledgeRow, KnowledgeUpdate } from '@/lib/db/queries/admin-knowledge-shared'

const KNOWLEDGE_KEY = ['admin', 'knowledge'] as const

/**
 * Create / update / delete go through `@supabase/ssr`'s browser client so
 * the request is signed with the admin's JWT — RLS enforces the
 * `is_admin()` gate. Mutations call `router.refresh()` so the Server
 * Component list re-fetches.
 *
 * `created_by` / `updated_by` are intentionally not in the payload — the
 * audit trigger sets `updated_by` from `auth.uid()` server-side, and
 * `created_by` is set explicitly in createKnowledge using the current user's id.
 */
export function useCreateKnowledge() {
  const router = useRouter()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<KnowledgeInsert, 'created_by' | 'updated_by'>): Promise<KnowledgeRow> => {
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('lca_knowledge')
        .insert({ ...input, created_by: userData.user?.id ?? null })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      router.refresh()
    },
  })
}

export function useUpdateKnowledge() {
  const router = useRouter()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Omit<KnowledgeUpdate, 'id' | 'created_by' | 'updated_by' | 'updated_at'> }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('lca_knowledge')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      router.refresh()
    },
  })
}

export function useDeleteKnowledge() {
  const router = useRouter()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('lca_knowledge').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KNOWLEDGE_KEY })
      router.refresh()
    },
  })
}
