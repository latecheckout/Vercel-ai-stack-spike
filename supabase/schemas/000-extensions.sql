-- Postgres extensions used across the schema.
-- pgvector backs the (production) semantic-search index on lca_knowledge.
-- The spike itself uses keyword search — the extension is here so the
-- generated migration matches the production-shape we'd ship.
create extension if not exists vector;
