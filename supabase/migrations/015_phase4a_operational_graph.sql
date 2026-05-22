-- Phase 4A — Operational Intake + Connections Layer
-- Tables: operational_cases, intake_documents, case_links
-- Storage: intake bucket (50 MB limit)
-- Run in Supabase SQL Editor

-- ── operational_cases ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operational_cases (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT        NOT NULL,
  type             TEXT        NOT NULL DEFAULT 'general'
                               CHECK (type IN ('general', 'claim', 'contract', 'compliance', 'incident',
                                               'project', 'task_batch', 'invoice', 'correspondence')),
  status           TEXT        NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'in_progress', 'pending_approval', 'resolved', 'closed', 'archived')),
  priority         TEXT        NOT NULL DEFAULT 'medium'
                               CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  source           TEXT        NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('manual', 'intake', 'email', 'workflow', 'import', 'system')),
  assigned_to      TEXT,
  reference_number TEXT,
  description      TEXT,
  workspace_id     UUID        REFERENCES public.workspaces(id) ON DELETE SET NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  timeline_summary TEXT,
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.operational_cases IS
  'Central operational case registry. Aggregates intake, workflows, approvals, and documents.';

-- ── intake_documents ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.intake_documents (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name      TEXT        NOT NULL,
  filename           TEXT        NOT NULL,
  file_type          TEXT        NOT NULL DEFAULT 'other'
                                 CHECK (file_type IN ('pdf', 'docx', 'txt', 'csv', 'image', 'note', 'other')),
  mime_type          TEXT,
  file_size          INTEGER,
  storage_path       TEXT,
  storage_bucket     TEXT        NOT NULL DEFAULT 'intake',
  source             TEXT        NOT NULL DEFAULT 'upload'
                                 CHECK (source IN ('upload', 'email', 'manual', 'api')),
  status             TEXT        NOT NULL DEFAULT 'processed'
                                 CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'archived')),
  extracted_text     TEXT,
  extracted_summary  TEXT,
  detected_category  TEXT,
  suggested_workflow TEXT,
  case_id            UUID        REFERENCES public.operational_cases(id) ON DELETE SET NULL,
  workspace_id       UUID        REFERENCES public.workspaces(id) ON DELETE SET NULL,
  uploaded_by        TEXT,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.intake_documents IS
  'Operational intake objects: file uploads, manual notes, email attachments.';

-- ── case_links ────────────────────────────────────────────────────────────────
-- Polymorphic operational graph edges connecting cases to any entity

CREATE TABLE IF NOT EXISTS public.case_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID        NOT NULL REFERENCES public.operational_cases(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  link_type   TEXT        NOT NULL DEFAULT 'related'
              CHECK (link_type IN ('related', 'caused_by', 'resulted_in', 'parent', 'child', 'duplicate', 'attachment')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.case_links IS
  'Operational graph edges. Links a case to any operational entity (approval, workflow_run, email, document, blocker).';

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_operational_cases_status    ON public.operational_cases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_cases_type      ON public.operational_cases (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_cases_priority  ON public.operational_cases (priority, status);
CREATE INDEX IF NOT EXISTS idx_operational_cases_workspace ON public.operational_cases (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_documents_case       ON public.intake_documents (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_documents_status     ON public.intake_documents (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_documents_workspace  ON public.intake_documents (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_documents_type       ON public.intake_documents (file_type);

CREATE INDEX IF NOT EXISTS idx_case_links_case             ON public.case_links (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_links_entity           ON public.case_links (entity_type, entity_id);

-- ── Updated_at triggers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operational_cases_updated_at  ON public.operational_cases;
DROP TRIGGER IF EXISTS trg_intake_documents_updated_at   ON public.intake_documents;

CREATE TRIGGER trg_operational_cases_updated_at
  BEFORE UPDATE ON public.operational_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_intake_documents_updated_at
  BEFORE UPDATE ON public.intake_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Disable RLS (service-role only) ──────────────────────────────────────────

ALTER TABLE public.operational_cases  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_documents   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_links         DISABLE ROW LEVEL SECURITY;

-- ── Supabase Storage: intake bucket ──────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'intake',
  'intake',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/csv',
    'application/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;
