-- ── Phase 2C Step 5 — Operational Memory Consolidation ──────────────────────

CREATE TABLE operational_memories (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid        REFERENCES projects(id) ON DELETE SET NULL,
  memory_type      text        NOT NULL
                               CHECK (memory_type IN (
                                 'recurring_workflow',
                                 'repeated_blocker',
                                 'approval_pattern',
                                 'inbox_pattern',
                                 'chain_pattern',
                                 'project_context',
                                 'operational_risk'
                               )),
  key              text        UNIQUE,
  title            text        NOT NULL,
  summary          text        NOT NULL,
  evidence         jsonb       NOT NULL DEFAULT '[]',
  confidence       float       NOT NULL DEFAULT 0.5
                               CHECK (confidence >= 0 AND confidence <= 1),
  source_type      text        NOT NULL,
  source_ids       jsonb       NOT NULL DEFAULT '[]',
  recurrence_count int         NOT NULL DEFAULT 1,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'archived')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_op_memories_type    ON operational_memories(memory_type);
CREATE INDEX idx_op_memories_status  ON operational_memories(status);
CREATE INDEX idx_op_memories_project ON operational_memories(project_id);
CREATE INDEX idx_op_memories_key     ON operational_memories(key) WHERE key IS NOT NULL;

ALTER TABLE operational_memories DISABLE ROW LEVEL SECURITY;

-- Reuse the update_updated_at_column() trigger function (created in 008)
CREATE TRIGGER operational_memories_updated_at
  BEFORE UPDATE ON operational_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
