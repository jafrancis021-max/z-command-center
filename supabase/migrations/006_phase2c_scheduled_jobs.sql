-- Phase 2C — Scheduled Operational Engine
-- Tables: scheduled_jobs, job_runs, job_logs
-- Run in Supabase SQL Editor (project zafqnsoznoynmybhhgww or your project id)

-- ── scheduled_jobs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type                   TEXT        NOT NULL UNIQUE,
  name                       TEXT        NOT NULL,
  description                TEXT,
  schedule_interval_minutes  INTEGER     NOT NULL DEFAULT 60,
  status                     TEXT        NOT NULL DEFAULT 'active'
                                         CHECK (status IN ('active', 'paused', 'failed')),
  last_run_at                TIMESTAMPTZ,
  next_run_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  config                     JSONB       NOT NULL DEFAULT '{}',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.scheduled_jobs IS
  'Registered background jobs. Worker polls next_run_at <= NOW() for due active jobs.';

-- ── job_runs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_job_id  UUID        NOT NULL REFERENCES public.scheduled_jobs(id) ON DELETE CASCADE,
  job_type          TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'running'
                                CHECK (status IN ('running', 'success', 'failed')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  duration_ms       INTEGER,
  error_message     TEXT,
  result            JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.job_runs IS
  'Execution record for each scheduled job invocation.';

-- ── job_logs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_run_id  UUID        NOT NULL REFERENCES public.job_runs(id) ON DELETE CASCADE,
  level       TEXT        NOT NULL DEFAULT 'info'
                          CHECK (level IN ('info', 'warn', 'error')),
  message     TEXT        NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.job_logs IS
  'Structured log lines emitted during a job_run execution.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Partial index so the worker query is fast
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
  ON public.scheduled_jobs (next_run_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_job_runs_job
  ON public.job_runs (scheduled_job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_status
  ON public.job_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_logs_run
  ON public.job_logs (job_run_id, created_at);

-- ── Disable RLS (service-role worker only) ────────────────────────────────────

ALTER TABLE public.scheduled_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_logs        DISABLE ROW LEVEL SECURITY;

-- ── Seed: initial operational jobs ───────────────────────────────────────────
-- next_run_at = NOW() so all jobs are immediately eligible on first worker tick

INSERT INTO public.scheduled_jobs
  (job_type, name, description, schedule_interval_minutes, next_run_at)
VALUES
  ('gmail_sync',
   'Gmail Sync',
   'Pull recent emails from Gmail into the emails table',
   15,
   NOW()),

  ('inbox_triage',
   'Inbox Triage',
   'Classify uncategorised emails with Claude and create approvals',
   30,
   NOW()),

  ('project_health_scan',
   'Project Health Scan',
   'Evaluate task/blocker health of every active project',
   60,
   NOW()),

  ('daily_operational_brief',
   'Daily Operational Brief',
   'Summarise the day''s activity across all projects and emit a feed event',
   1440,
   NOW()),

  ('weekly_report',
   'Weekly Report',
   'Generate a cross-project weekly progress summary',
   10080,
   NOW()),

  ('blocker_escalation',
   'Blocker Escalation',
   'Find critical unresolved blockers older than 24 h and surface them',
   60,
   NOW()),

  ('approval_followup',
   'Approval Follow-up',
   'Detect pending approvals older than 24 h and emit a warning',
   120,
   NOW()),

  ('memory_compaction',
   'Memory Compaction',
   'Compact processed memory extractions to reduce redundancy',
   720,
   NOW())

ON CONFLICT (job_type) DO NOTHING;
