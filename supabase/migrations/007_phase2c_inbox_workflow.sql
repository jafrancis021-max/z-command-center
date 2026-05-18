-- Phase 2C Step 3: Inbox-to-Workflow Automation
-- inbox_workflow_suggestions: one row per email × suggestion_type

CREATE TABLE IF NOT EXISTS public.inbox_workflow_suggestions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id         UUID        NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  project_id       UUID        REFERENCES public.projects(id) ON DELETE SET NULL,

  suggestion_type  TEXT        NOT NULL CHECK (suggestion_type IN (
    'approval_needed',
    'follow_up_needed',
    'blocker_detected',
    'task_candidate',
    'handover_candidate',
    'meeting_candidate',
    'document_request',
    'unknown'
  )),

  title            TEXT        NOT NULL,
  description      TEXT,
  confidence       NUMERIC(4,2) NOT NULL DEFAULT 0.50
                   CHECK (confidence >= 0 AND confidence <= 1),

  status           TEXT        NOT NULL DEFAULT 'suggested'
                   CHECK (status IN ('suggested', 'approved', 'rejected', 'executed')),

  suggested_actions JSONB      NOT NULL DEFAULT '[]',
  source           TEXT        NOT NULL DEFAULT 'inbox_workflow_detector',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Only one suggestion of each type per email
  UNIQUE (email_id, suggestion_type)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inbox_workflow_suggestions_email_id
  ON public.inbox_workflow_suggestions (email_id);

CREATE INDEX IF NOT EXISTS idx_inbox_workflow_suggestions_status
  ON public.inbox_workflow_suggestions (status);

CREATE INDEX IF NOT EXISTS idx_inbox_workflow_suggestions_created_at
  ON public.inbox_workflow_suggestions (created_at DESC);

-- Disable RLS (consistent with rest of schema)
ALTER TABLE public.inbox_workflow_suggestions DISABLE ROW LEVEL SECURITY;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_inbox_workflow_suggestions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_inbox_workflow_suggestions
  ON public.inbox_workflow_suggestions;

CREATE TRIGGER trg_touch_inbox_workflow_suggestions
  BEFORE UPDATE ON public.inbox_workflow_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_inbox_workflow_suggestions();
