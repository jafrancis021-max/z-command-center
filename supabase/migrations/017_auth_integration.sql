-- ── Phase 5A — Supabase Auth Integration ────────────────────────────────────
-- Links profiles to Supabase Auth, adds checklist progress, preferences

-- Link profiles to Supabase auth.users
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_auth_id ON profiles(auth_id);

-- Onboarding checklist state (JSON map of step_id → completed bool + timestamp)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS checklist_progress jsonb DEFAULT '{}';

-- User preferences (theme, assistant settings, etc.)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';

-- Workspace settings table
CREATE TABLE IF NOT EXISTS workspace_settings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  display_name    text,
  logo_url        text,
  settings        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_settings DISABLE ROW LEVEL SECURITY;
