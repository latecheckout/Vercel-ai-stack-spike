-- ─── Extensions ─────────────────────────────────────────────────────────────
-- Enable pgvector for future semantic search on lca_knowledge.
-- (The spike uses keyword search; pgvector is here to show the production schema.)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── sessions ─────────────────────────────────────────────────────────────────
-- One row per visitor session. id = chatId from WorkflowChatTransport / useChat.
CREATE TABLE sessions (
  id          UUID        PRIMARY KEY,          -- client-generated UUID (= chatId)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB       NOT NULL DEFAULT '{}'::JSONB
);

-- ─── messages ─────────────────────────────────────────────────────────────────
-- Full conversation history for replay and inspection.
CREATE TABLE messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_session_id_idx ON messages (session_id, created_at);

-- ─── visitor_facts ────────────────────────────────────────────────────────────
-- Facts the agent has learned about the visitor — shown in the "What LCA knows
-- about you" panel and editable/deletable by the visitor.
CREATE TABLE visitor_facts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  fact        TEXT        NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN ('company', 'role', 'website', 'project', 'other')),
  source      TEXT        NOT NULL,  -- e.g. "visitor stated", "from website acme.com"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX visitor_facts_session_id_idx ON visitor_facts (session_id, created_at);

-- ─── lca_knowledge ────────────────────────────────────────────────────────────
-- Curated LCA content. The spike populates this via /api/admin/seed-knowledge.
-- `embedding` is for production pgvector search (seeded but not queried in spike).
CREATE TABLE lca_knowledge (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN ('service', 'case-study', 'approach', 'engagement', 'faq')),
  embedding   vector(1536),           -- text-embedding-3-small via AI Gateway
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX lca_knowledge_category_idx ON lca_knowledge (category);
-- pgvector index (IVFFlat) — uncomment when enabling semantic search:
-- CREATE INDEX lca_knowledge_embedding_idx ON lca_knowledge
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- ─── Row-Level Security ───────────────────────────────────────────────────────
-- Spike uses a single anonymous role — no auth. All operations permitted.
-- TODO: Tighten before any real-user deployment.

ALTER TABLE sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_facts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lca_knowledge  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_sessions"      ON sessions       FOR ALL  USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_messages"      ON messages       FOR ALL  USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_visitor_facts" ON visitor_facts  FOR ALL  USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_lca_knowledge" ON lca_knowledge FOR SELECT USING (true);
-- Only service-role key can write knowledge (via /api/admin/seed-knowledge)
CREATE POLICY "service_write_lca_knowledge" ON lca_knowledge FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
