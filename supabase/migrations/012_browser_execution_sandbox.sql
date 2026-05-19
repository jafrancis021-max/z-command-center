-- Browser Execution Sandbox tables

CREATE TABLE IF NOT EXISTS browser_execution_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  workflow_chain_run_id uuid NULL,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','waiting_approval','completed','failed')),
  mode                  text NOT NULL DEFAULT 'headless'
                          CHECK (mode IN ('visible','headless')),
  target_url            text NOT NULL,
  task_description      text NOT NULL DEFAULT '',
  result                jsonb,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS browser_execution_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES browser_execution_runs(id) ON DELETE CASCADE,
  step_order      int  NOT NULL,
  action_type     text NOT NULL,
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed','skipped')),
  screenshot_path text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_browser_runs_status  ON browser_execution_runs(status);
CREATE INDEX IF NOT EXISTS idx_browser_runs_created ON browser_execution_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_steps_run_id ON browser_execution_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_browser_steps_order  ON browser_execution_steps(run_id, step_order);

ALTER TABLE browser_execution_runs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE browser_execution_steps DISABLE ROW LEVEL SECURITY;
