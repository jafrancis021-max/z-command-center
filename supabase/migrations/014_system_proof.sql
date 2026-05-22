-- Phase 3G — System Proof Infrastructure
-- Tables: system_proof_runs (persisted scan results)
-- Scheduled job: system_proof_scan (every 15 min)
-- Run in Supabase SQL Editor

-- ── system_proof_runs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_proof_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_status TEXT        NOT NULL CHECK (overall_status IN ('healthy', 'degraded', 'critical')),
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms    INTEGER     NOT NULL DEFAULT 0,
  pass_count     INTEGER     NOT NULL DEFAULT 0,
  warning_count  INTEGER     NOT NULL DEFAULT 0,
  fail_count     INTEGER     NOT NULL DEFAULT 0,
  total_count    INTEGER     NOT NULL DEFAULT 0,
  checks         JSONB       NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.system_proof_runs IS
  'Persisted results from each system proof scan. checks column holds the full ProofCheck[] array as JSONB.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_system_proof_runs_checked_at
  ON public.system_proof_runs (checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_proof_runs_status
  ON public.system_proof_runs (overall_status, checked_at DESC);

-- ── Disable RLS (service-role only) ──────────────────────────────────────────

ALTER TABLE public.system_proof_runs DISABLE ROW LEVEL SECURITY;

-- ── Seed: scheduled job ───────────────────────────────────────────────────────

INSERT INTO public.scheduled_jobs
  (job_type, name, description, schedule_interval_minutes, next_run_at)
VALUES
  ('system_proof_scan',
   'System Proof Scan',
   'Run all 17 subsystem health checks and persist results; emit notification on degraded/critical',
   15,
   NOW())
ON CONFLICT (job_type) DO NOTHING;
