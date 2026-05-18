-- Phase 2B: Gmail Integration (applied 2026-05-15)
-- Tables already existed with different schema; this migration added missing columns.

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'uncategorized',
  ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_action BOOLEAN DEFAULT false;

ALTER TABLE email_triage_results
  ADD COLUMN IF NOT EXISTS urgency TEXT,
  ADD COLUMN IF NOT EXISTS suggested_reply TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2);

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS emails_gmail_id_idx ON emails(gmail_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_email_address_idx ON email_accounts(email_address);

INSERT INTO workflow_templates (name, description, category, project_scoped, input_schema, steps, enabled)
VALUES
  ('Process Gmail Inbox', 'Sync recent emails, triage unsorted, extract tasks, create draft replies and approvals', 'email', false, '{}', '[{"name":"Sync recent emails"},{"name":"Triage unsorted emails"},{"name":"Extract actionable tasks"},{"name":"Create draft replies"},{"name":"Create approvals"},{"name":"Log feed events"}]', true),
  ('Review Urgent Emails', 'Find critical/high urgency emails, summarize and recommend actions', 'email', false, '{}', '[{"name":"Find critical emails"},{"name":"Summarize urgent items"},{"name":"Recommend actions"},{"name":"Return structured output"}]', true)
ON CONFLICT DO NOTHING;
