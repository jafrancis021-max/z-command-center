-- ── Phase 2C Step 4 — Workflow Chaining ──────────────────────────────────────

CREATE TABLE workflow_chains (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text,
  trigger_type text        NOT NULL,
  status       text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused')),
  config       jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_chain_steps (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_chain_id uuid        NOT NULL REFERENCES workflow_chains(id) ON DELETE CASCADE,
  step_order        int         NOT NULL,
  step_type         text        NOT NULL,
  title             text        NOT NULL,
  description       text,
  requires_approval boolean     NOT NULL DEFAULT false,
  config            jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_chain_runs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_chain_id uuid        NOT NULL REFERENCES workflow_chains(id),
  source_type       text        NOT NULL,
  source_id         text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','running','waiting_approval','completed','failed')),
  current_step      int         NOT NULL DEFAULT 1,
  result            jsonb       NOT NULL DEFAULT '{}',
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_chain_runs_status   ON workflow_chain_runs (status);
CREATE INDEX idx_workflow_chain_runs_source   ON workflow_chain_runs (source_type, source_id);
CREATE INDEX idx_workflow_chain_steps_chain   ON workflow_chain_steps (workflow_chain_id, step_order);
CREATE INDEX idx_workflow_chains_trigger_type ON workflow_chains (trigger_type, status);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_workflow_chains_updated_at
  BEFORE UPDATE ON workflow_chains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_chain_runs_updated_at
  BEFORE UPDATE ON workflow_chain_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE workflow_chains      DISABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_chain_steps DISABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_chain_runs  DISABLE ROW LEVEL SECURITY;

-- ── Seed: chain definitions ───────────────────────────────────────────────────

INSERT INTO workflow_chains (id, name, description, trigger_type, status) VALUES
  ('a1000000-0001-0001-0001-000000000001',
   'Approval Needed Flow',
   'Creates approval record and schedules follow-up reminder',
   'approval_needed', 'active'),

  ('a2000000-0002-0002-0002-000000000002',
   'Blocker Detected Flow',
   'Logs blocker signal and runs escalation check',
   'blocker_detected', 'active'),

  ('a3000000-0003-0003-0003-000000000003',
   'Follow-Up Needed Flow',
   'Creates follow-up task and emits reminder event',
   'follow_up_needed', 'active'),

  ('a4000000-0004-0004-0004-000000000004',
   'Document Request Flow',
   'Creates task and generates draft checklist for operator review',
   'document_request', 'active');

-- ── Seed: approval_needed steps ──────────────────────────────────────────────

INSERT INTO workflow_chain_steps
  (workflow_chain_id, step_order, step_type, title, description, requires_approval, config)
VALUES
  ('a1000000-0001-0001-0001-000000000001', 1,
   'emit_feed_event',
   'Approval Chain Started',
   'Log that the approval workflow chain has been triggered',
   false,
   '{"event_type":"chain_started","severity":"info"}'),

  ('a1000000-0001-0001-0001-000000000001', 2,
   'create_approval',
   'Create Approval Record',
   'Create a pending approval record (skipped if one already exists)',
   false,
   '{"approval_type":"inbox_chain","title_prefix":"Review required"}'),

  ('a1000000-0001-0001-0001-000000000001', 3,
   'emit_feed_event',
   'Follow-Up Reminder Scheduled',
   'Emit a follow-up reminder to the operational feed',
   false,
   '{"event_type":"follow_up_reminder","severity":"info"}');

-- ── Seed: blocker_detected steps ─────────────────────────────────────────────

INSERT INTO workflow_chain_steps
  (workflow_chain_id, step_order, step_type, title, description, requires_approval, config)
VALUES
  ('a2000000-0002-0002-0002-000000000002', 1,
   'emit_feed_event',
   'Blocker Chain Started',
   'Log that the blocker detection chain has been triggered',
   false,
   '{"event_type":"chain_started","severity":"warning"}'),

  ('a2000000-0002-0002-0002-000000000002', 2,
   'emit_feed_event',
   'Blocker Signal Noted',
   'Emit feed event logging the inbound blocker signal',
   false,
   '{"event_type":"blocker_noted","severity":"warning"}'),

  ('a2000000-0002-0002-0002-000000000002', 3,
   'escalation_check',
   'Escalation Check',
   'Check all open high/critical blockers and escalate if found',
   false,
   '{"severity_threshold":"high"}');

-- ── Seed: follow_up_needed steps ─────────────────────────────────────────────

INSERT INTO workflow_chain_steps
  (workflow_chain_id, step_order, step_type, title, description, requires_approval, config)
VALUES
  ('a3000000-0003-0003-0003-000000000003', 1,
   'emit_feed_event',
   'Follow-Up Chain Started',
   'Log that the follow-up workflow chain has been triggered',
   false,
   '{"event_type":"chain_started","severity":"info"}'),

  ('a3000000-0003-0003-0003-000000000003', 2,
   'create_task',
   'Create Follow-Up Task',
   'Create a task to action the follow-up request',
   false,
   '{"title_prefix":"Follow up:","priority":"medium"}'),

  ('a3000000-0003-0003-0003-000000000003', 3,
   'emit_feed_event',
   'Follow-Up Reminder Emitted',
   'Emit follow-up reminder event to operational feed',
   false,
   '{"event_type":"follow_up_reminder","severity":"info"}');

-- ── Seed: document_request steps ─────────────────────────────────────────────

INSERT INTO workflow_chain_steps
  (workflow_chain_id, step_order, step_type, title, description, requires_approval, config)
VALUES
  ('a4000000-0004-0004-0004-000000000004', 1,
   'emit_feed_event',
   'Document Request Chain Started',
   'Log that the document request chain has been triggered',
   false,
   '{"event_type":"chain_started","severity":"info"}'),

  ('a4000000-0004-0004-0004-000000000004', 2,
   'create_task',
   'Create Document Task',
   'Create a task to gather and prepare the requested document',
   false,
   '{"title_prefix":"Document:","priority":"medium"}'),

  ('a4000000-0004-0004-0004-000000000004', 3,
   'draft_checklist_suggestion',
   'Draft Checklist',
   'Prepare a draft checklist for the document request — requires operator review before proceeding',
   true,
   '{"checklist_type":"document_request"}');
