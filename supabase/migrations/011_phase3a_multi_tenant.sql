-- ── Phase 3A — Multi-Tenant Operational Infrastructure ───────────────────────
-- Creates: organizations, workspaces, profiles, workspace_memberships, audit_logs
-- Seeds:   "Z Internal" org + "Command Center" workspace
-- Adds:    nullable workspace_id to 11 existing tables
-- Backfills all existing rows to the default workspace

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Core multi-tenant tables
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  status     text        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'operator'
                           CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_id     uuid        REFERENCES profiles(id)   ON DELETE SET NULL,
  action       text        NOT NULL,
  target_type  text,
  target_id    text,
  metadata     jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_org        ON workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace  ON workspace_memberships(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace   ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action      ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created     ON audit_logs(created_at DESC);

-- RLS off (single-operator, no user auth yet)
ALTER TABLE organizations         DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces            DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            DISABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Seed default organization and workspace
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO organizations (name, slug, status)
VALUES ('Z Internal', 'z-internal', 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workspaces (organization_id, name, slug, status)
SELECT id, 'Command Center', 'command-center', 'active'
FROM   organizations
WHERE  slug = 'z-internal'
ON CONFLICT (slug) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Add nullable workspace_id to tables we are certain exist
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE projects  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE blockers  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE emails    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_id  ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_blockers_workspace_id  ON blockers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_approvals_workspace_id ON approvals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_emails_workspace_id    ON emails(workspace_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Conditionally add workspace_id to tables from later migrations
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- tasks (may pre-date migration 001)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tasks'
  ) THEN
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
  END IF;

  -- inbox_workflow_suggestions (migration 007)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inbox_workflow_suggestions'
  ) THEN
    ALTER TABLE inbox_workflow_suggestions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_iws_workspace_id ON inbox_workflow_suggestions(workspace_id);
  END IF;

  -- workflow_chains (migration 008)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workflow_chains'
  ) THEN
    ALTER TABLE workflow_chains ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_workflow_chains_workspace_id ON workflow_chains(workspace_id);
  END IF;

  -- workflow_chain_runs (migration 008)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workflow_chain_runs'
  ) THEN
    ALTER TABLE workflow_chain_runs ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_workflow_chain_runs_workspace_id ON workflow_chain_runs(workspace_id);
  END IF;

  -- operational_memories (migration 009)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'operational_memories'
  ) THEN
    ALTER TABLE operational_memories ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_operational_memories_workspace_id ON operational_memories(workspace_id);
  END IF;

  -- notifications (migration 010)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON notifications(workspace_id);
  END IF;

  -- operational_feed_events (phase 2A)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'operational_feed_events'
  ) THEN
    ALTER TABLE operational_feed_events ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
    CREATE INDEX IF NOT EXISTS idx_feed_events_workspace_id ON operational_feed_events(workspace_id);
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Backfill all existing rows to the default workspace
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  ws_id uuid;
BEGIN
  SELECT id INTO ws_id FROM workspaces WHERE slug = 'command-center' LIMIT 1;
  IF ws_id IS NULL THEN
    RAISE WARNING 'Default workspace not found — backfill skipped';
    RETURN;
  END IF;

  UPDATE projects  SET workspace_id = ws_id WHERE workspace_id IS NULL;
  UPDATE blockers  SET workspace_id = ws_id WHERE workspace_id IS NULL;
  UPDATE approvals SET workspace_id = ws_id WHERE workspace_id IS NULL;
  UPDATE emails    SET workspace_id = ws_id WHERE workspace_id IS NULL;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='tasks') THEN
    UPDATE tasks SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='inbox_workflow_suggestions') THEN
    UPDATE inbox_workflow_suggestions SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='workflow_chains') THEN
    UPDATE workflow_chains SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='workflow_chain_runs') THEN
    UPDATE workflow_chain_runs SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='operational_memories') THEN
    UPDATE operational_memories SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    UPDATE notifications SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='operational_feed_events') THEN
    UPDATE operational_feed_events SET workspace_id = ws_id WHERE workspace_id IS NULL;
  END IF;
END $$;
