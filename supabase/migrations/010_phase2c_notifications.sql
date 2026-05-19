-- ── Phase 2C Step 6 — Notification Layer ────────────────────────────────────

CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'info'
                          CHECK (severity IN ('info', 'warning', 'critical')),
  title       text        NOT NULL,
  message     text        NOT NULL,
  source_type text,
  source_id   text,
  action_url  text,
  key         text,
  read        boolean     NOT NULL DEFAULT false,
  dismissed   boolean     NOT NULL DEFAULT false,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Partial indexes — only index live (non-dismissed) rows for read/severity queries
CREATE INDEX idx_notifications_unread   ON notifications(read)     WHERE NOT dismissed;
CREATE INDEX idx_notifications_severity ON notifications(severity)  WHERE NOT dismissed;
CREATE INDEX idx_notifications_created  ON notifications(created_at DESC);
CREATE INDEX idx_notifications_key      ON notifications(key)       WHERE key IS NOT NULL AND NOT dismissed;

ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ── Seed notification_scan scheduled job ──────────────────────────────────────

INSERT INTO public.scheduled_jobs
  (job_type, name, description, schedule_interval_minutes, next_run_at)
VALUES
  ('notification_scan',
   'Notification Scan',
   'Scan operational state and emit actionable notifications for attention-needed conditions',
   15,
   NOW())
ON CONFLICT (job_type) DO NOTHING;
