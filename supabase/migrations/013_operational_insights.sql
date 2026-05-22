-- Phase 3F: Operational Insights
-- Persisted output of the operational insight engine

create table if not exists operational_insights (
  id             uuid        primary key default gen_random_uuid(),
  insight_key    text        not null unique,  -- deterministic, for upserts
  insight_type   text        not null,
  severity       text        not null check (severity in ('critical', 'high', 'medium', 'low')),
  confidence     integer     not null default 50 check (confidence between 0 and 100),
  area           text        not null default 'general',
  title          text        not null,
  description    text        not null,
  why_it_matters text        not null default '',
  recommendation text        not null default '',
  source_ids     text[]      not null default '{}',
  workspace_id   uuid        references workspaces(id) on delete cascade,
  status         text        not null default 'active' check (status in ('active', 'dismissed', 'resolved')),
  metadata       jsonb       not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexes
create index if not exists operational_insights_severity_idx    on operational_insights (severity);
create index if not exists operational_insights_status_idx      on operational_insights (status);
create index if not exists operational_insights_workspace_idx   on operational_insights (workspace_id);
create index if not exists operational_insights_created_at_idx  on operational_insights (created_at desc);
create index if not exists operational_insights_type_idx        on operational_insights (insight_type);

-- Auto-update updated_at
create or replace function update_operational_insights_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operational_insights_updated_at on operational_insights;
create trigger operational_insights_updated_at
  before update on operational_insights
  for each row execute procedure update_operational_insights_updated_at();
