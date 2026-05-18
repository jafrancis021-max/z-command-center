-- Z Command Center v1 — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor

-- ── Projects ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'paused', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tasks ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'todo'
                          CHECK (status IN ('todo', 'doing', 'blocked', 'done')),
  priority    TEXT        NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- ── Decisions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decisions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  decision    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_project_id ON decisions(project_id);

-- ── Notes ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);

-- ── Prompts ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_type TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompts_project_id ON prompts(project_id);

-- ── Handovers ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS handovers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handovers_project_id ON handovers(project_id);

-- ── Disable RLS for personal use (enable + add policies when multi-user) ──────

ALTER TABLE projects  DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks     DISABLE ROW LEVEL SECURITY;
ALTER TABLE decisions DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE prompts   DISABLE ROW LEVEL SECURITY;
ALTER TABLE handovers DISABLE ROW LEVEL SECURITY;

-- ── Seed initial projects ─────────────────────────────────────────────────────

INSERT INTO projects (name, description, status) VALUES
(
  'SPORTSPULSE',
  'Live sports market intelligence engine. Focus: fair value, market psychology, narratives, conviction, SportsCard intelligence. Rules: NOT betting picks. No fake signals. No proven gap = no strong market state. Supabase is source of truth. Claude Code is execution layer. Lovable is read-only UI layer.',
  'active'
),
(
  'MORTGAGEBLOCK',
  'Residential equity infrastructure and RWA platform. Focus: reverse mortgages, SPVs, tokenization, investor participation, institutional infrastructure. Rules: Legal structure first. SPVs hold exposure. Tokenization represents economic exposure, not property title. Water Financial remains regulated lender/operator.',
  'active'
)
ON CONFLICT DO NOTHING;
