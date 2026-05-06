// Re-export the generated helpers under the conventional path used across
// LCA projects. The Supabase CLI now emits Tables/TablesInsert/TablesUpdate
// /Enums alongside `Database`, so this file simply forwards them.
export type { Database, Tables, TablesInsert, TablesUpdate, Enums } from '@/lib/database.types'
