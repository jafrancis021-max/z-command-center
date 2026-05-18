-- Z Full Stack Personal Operator — Migration 001
-- Run in Supabase Dashboard → SQL Editor

-- ═══════════════════════════════════════════════════════════════════
-- PHASE A — Enhanced project state + operational tables
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_phase    TEXT,
  ADD COLUMN IF NOT EXISTS current_status   TEXT    DEFAULT 'planning',
  ADD COLUMN IF NOT EXISTS main_blocker     TEXT,
  ADD COLUMN IF NOT EXISTS next_step        TEXT,
  ADD COLUMN IF NOT EXISTS risk_level       TEXT    DEFAULT 'low'
                                                    CHECK (risk_level IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS last_success     TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- project timeline — append-only event log per project
CREATE TABLE IF NOT EXISTS project_timeline (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,   -- 'milestone','blocker_added','phase_change','success','note'
  title       TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_timeline_project_id ON project_timeline(project_id);

-- blockers — current obstacles per project
CREATE TABLE IF NOT EXISTS blockers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  severity    TEXT        NOT NULL DEFAULT 'medium'
                          CHECK (severity IN ('low','medium','high','critical')),
  status      TEXT        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','in_progress','resolved')),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blockers_project_id ON blockers(project_id);

-- architecture rules — immutable constraints per project
CREATE TABLE IF NOT EXISTS architecture_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule        TEXT        NOT NULL,
  category    TEXT        DEFAULT 'general',  -- 'security','data','ui','api','deployment'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arch_rules_project_id ON architecture_rules(project_id);

-- claude_sessions — records of Claude Code work sessions
CREATE TABLE IF NOT EXISTS claude_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_title   TEXT        NOT NULL,
  prompt_used     TEXT,
  files_touched   TEXT[],
  status          TEXT        NOT NULL DEFAULT 'completed'
                              CHECK (status IN ('in_progress','completed','failed','partial')),
  session_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON claude_sessions(project_id);

-- session_results — outcomes of Claude Code sessions
CREATE TABLE IF NOT EXISTS session_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES claude_sessions(id) ON DELETE CASCADE,
  what_built     TEXT,
  what_works     TEXT,
  what_broken    TEXT,
  next_step      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- PHASE B — Document memory
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  file_name       TEXT        NOT NULL,
  file_url        TEXT,
  file_type       TEXT        NOT NULL,   -- 'txt','md','pdf','doc'
  file_size_bytes BIGINT,
  extracted_text  TEXT,
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);

CREATE TABLE IF NOT EXISTS document_chunks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id   UUID        REFERENCES projects(id) ON DELETE SET NULL,
  chunk_index  INT         NOT NULL,
  chunk_text   TEXT        NOT NULL,
  metadata     JSONB       DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_project_id  ON document_chunks(project_id);

-- Full-text search index on chunk text
CREATE INDEX IF NOT EXISTS idx_chunks_text_search
  ON document_chunks USING gin(to_tsvector('english', chunk_text));

-- ═══════════════════════════════════════════════════════════════════
-- PHASE C — Gmail / email
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address   TEXT        NOT NULL UNIQUE,
  display_name    TEXT,
  provider        TEXT        NOT NULL DEFAULT 'gmail',
  access_token    TEXT,
  refresh_token   TEXT,
  token_expiry    TIMESTAMPTZ,
  scopes          TEXT[],
  status          TEXT        NOT NULL DEFAULT 'connected'
                              CHECK (status IN ('connected','disconnected','error')),
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  gmail_id        TEXT        NOT NULL,
  thread_id       TEXT,
  subject         TEXT,
  sender_email    TEXT,
  sender_name     TEXT,
  recipient_emails TEXT[],
  snippet         TEXT,
  body_text       TEXT,
  received_at     TIMESTAMPTZ,
  is_read         BOOLEAN     DEFAULT FALSE,
  labels          TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, gmail_id)
);
CREATE INDEX IF NOT EXISTS idx_emails_account_id ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);

CREATE TABLE IF NOT EXISTS email_triage_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID        NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  classification  TEXT        NOT NULL,   -- 'urgent','project_related','admin','finance','opportunity','ignore'
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  extracted_tasks TEXT[],
  summary         TEXT,
  priority_score  INT         DEFAULT 0,
  reasoning       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID        REFERENCES emails(id) ON DELETE SET NULL,
  account_id      UUID        REFERENCES email_accounts(id) ON DELETE SET NULL,
  to_address      TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  context_note    TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','approved','sent','rejected')),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- PHASE D — Approval system
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approvals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_type   TEXT        NOT NULL,   -- 'email_draft','task_batch','handover','prompt','workflow_action','document_summary'
  title           TEXT        NOT NULL,
  description     TEXT,
  payload         JSONB       NOT NULL DEFAULT '{}',
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected','expired')),
  rejection_note  TEXT,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approvals_status     ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_project_id ON approvals(project_id);

-- ═══════════════════════════════════════════════════════════════════
-- PHASE E — Workflow engine
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflows (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT,
  trigger_type    TEXT        NOT NULL DEFAULT 'manual',  -- 'manual','scheduled','webhook'
  steps           JSONB       NOT NULL DEFAULT '[]',      -- [{type, name, config}]
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','running','completed','failed','cancelled')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  input           JSONB       DEFAULT '{}',
  output          JSONB       DEFAULT '{}',
  error_message   TEXT,
  triggered_by    TEXT        DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID        NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_name       TEXT        NOT NULL,
  step_type       TEXT        NOT NULL,   -- 'ai_call','db_query','notification','approval_gate'
  step_index      INT         NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','running','completed','failed','skipped')),
  input           JSONB       DEFAULT '{}',
  output          JSONB       DEFAULT '{}',
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type     TEXT        NOT NULL,   -- 'ai_call','approval','document_upload','workflow_step','triage'
  entity_type     TEXT,
  entity_id       TEXT,
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  summary         TEXT,
  input           JSONB       DEFAULT '{}',
  output          JSONB       DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'completed'
                              CHECK (status IN ('completed','failed','pending')),
  error_message   TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_logs_type       ON action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_action_logs_project_id ON action_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- PHASE F — Browser automation (scaffold only)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS browser_tasks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  task_type       TEXT        NOT NULL,   -- 'open_url','scrape_page','download_file','fill_form','screenshot'
  name            TEXT        NOT NULL,
  config          JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','approved','running','completed','failed')),
  requires_approval BOOLEAN   DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS browser_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID        NOT NULL REFERENCES browser_tasks(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','running','completed','failed')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  output          JSONB       DEFAULT '{}',
  screenshot_url  TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- Disable RLS on all new tables (personal use)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE project_timeline     DISABLE ROW LEVEL SECURITY;
ALTER TABLE blockers             DISABLE ROW LEVEL SECURITY;
ALTER TABLE architecture_rules   DISABLE ROW LEVEL SECURITY;
ALTER TABLE claude_sessions      DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_results      DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents            DISABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks      DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts       DISABLE ROW LEVEL SECURITY;
ALTER TABLE emails               DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_triage_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE email_drafts         DISABLE ROW LEVEL SECURITY;
ALTER TABLE approvals            DISABLE ROW LEVEL SECURITY;
ALTER TABLE workflows            DISABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs        DISABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps       DISABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs          DISABLE ROW LEVEL SECURITY;
ALTER TABLE browser_tasks        DISABLE ROW LEVEL SECURITY;
ALTER TABLE browser_runs         DISABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- Seed default workflows
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO workflows (name, description, trigger_type, steps) VALUES
(
  'Process Inbox',
  'Sync Gmail, triage emails, extract tasks, create drafts for action items',
  'manual',
  '[{"type":"gmail_sync","name":"Sync recent emails"},{"type":"ai_triage","name":"Classify and triage emails"},{"type":"task_extraction","name":"Extract tasks from urgent emails"}]'::jsonb
),
(
  'Generate Project Handover',
  'Gather all project context and generate a complete handover document',
  'manual',
  '[{"type":"db_query","name":"Load project context"},{"type":"ai_call","name":"Generate handover"},{"type":"approval_gate","name":"Review handover"},{"type":"db_write","name":"Save approved handover"}]'::jsonb
),
(
  'Generate Next Claude Code Prompt',
  'Build context-aware Claude Code prompt from current project state',
  'manual',
  '[{"type":"db_query","name":"Load tasks and decisions"},{"type":"ai_call","name":"Generate prompt"},{"type":"db_write","name":"Save prompt"}]'::jsonb
),
(
  'Summarize Uploaded Document',
  'Extract text, chunk it, summarize, and make it searchable',
  'manual',
  '[{"type":"text_extraction","name":"Extract document text"},{"type":"chunking","name":"Chunk document"},{"type":"ai_call","name":"Generate summary"},{"type":"approval_gate","name":"Review summary"}]'::jsonb
),
(
  'Weekly Project Status Report',
  'Compile tasks, decisions, blockers and generate a weekly status report',
  'manual',
  '[{"type":"db_query","name":"Load week activity"},{"type":"ai_call","name":"Generate report"},{"type":"approval_gate","name":"Review report"}]'::jsonb
),
(
  'Extract Tasks From Notes',
  'Read recent notes and extract actionable tasks',
  'manual',
  '[{"type":"db_query","name":"Load recent notes"},{"type":"ai_call","name":"Extract tasks"},{"type":"approval_gate","name":"Review tasks before adding"}]'::jsonb
)
ON CONFLICT DO NOTHING;
