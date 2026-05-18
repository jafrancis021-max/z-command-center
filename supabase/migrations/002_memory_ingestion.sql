-- Phase F: Project Memory Ingestion
-- Applied 2026-05-15 via Supabase MCP apply_migration

CREATE TABLE IF NOT EXISTS project_memories (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID         REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT         NOT NULL,
  source_type      TEXT         NOT NULL DEFAULT 'upload'
                                CHECK (source_type IN ('upload','paste','handover','transcript','architecture','log','strategy')),
  raw_text         TEXT         NOT NULL,
  summary          TEXT,
  ingestion_status TEXT         NOT NULL DEFAULT 'pending'
                                CHECK (ingestion_status IN ('pending','processing','complete','failed')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE project_memories DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS memory_chunks (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id    UUID         NOT NULL REFERENCES project_memories(id) ON DELETE CASCADE,
  project_id   UUID         REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index  INTEGER      NOT NULL,
  chunk_text   TEXT         NOT NULL,
  metadata     JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE memory_chunks DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_memory_chunks_memory_id
  ON memory_chunks (memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_fts
  ON memory_chunks USING GIN (to_tsvector('english', chunk_text));

CREATE TABLE IF NOT EXISTS memory_extractions (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id        UUID          NOT NULL REFERENCES project_memories(id) ON DELETE CASCADE,
  project_id       UUID          REFERENCES projects(id) ON DELETE CASCADE,
  extraction_type  TEXT          NOT NULL
                                 CHECK (extraction_type IN ('decision','blocker','next_step','architecture_rule','warning','milestone')),
  content          TEXT          NOT NULL,
  confidence       NUMERIC(3,2)  NOT NULL DEFAULT 0.80,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE memory_extractions DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_memory_extractions_memory_id
  ON memory_extractions (memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_extractions_project_id
  ON memory_extractions (project_id);
