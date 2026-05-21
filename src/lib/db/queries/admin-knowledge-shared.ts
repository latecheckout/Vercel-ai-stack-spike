import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Shared between server queries (admin-knowledge.ts) and client components.
// Kept in its own file because pulling these from admin-knowledge.ts would
// drag `next/headers` (via @/lib/supabase/server) into the client bundle.

export type KnowledgeRow = Tables<'lca_knowledge'>
export type KnowledgeInsert = TablesInsert<'lca_knowledge'>
export type KnowledgeUpdate = TablesUpdate<'lca_knowledge'>

export const KNOWLEDGE_CATEGORIES = ['overview', 'case-study', 'guide', 'careers'] as const
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]
