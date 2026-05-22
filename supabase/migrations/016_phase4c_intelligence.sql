-- Phase 4C: Operational Intelligence Engine
-- Adds case-level pressure scoring and case-graph linking to insights

-- ── Extend operational_cases with pressure fields ─────────────────────────────

alter table operational_cases
  add column if not exists pressure_score        integer     check (pressure_score between 0 and 100),
  add column if not exists pressure_level        text        check (pressure_level in ('low', 'moderate', 'elevated', 'critical')),
  add column if not exists pressure_reason       text,
  add column if not exists last_pressure_update  timestamptz;

create index if not exists operational_cases_pressure_idx
  on operational_cases (pressure_level, pressure_score desc)
  where pressure_level is not null;

-- ── Extend operational_insights with case-graph linking fields ────────────────

alter table operational_insights
  add column if not exists related_case_id      uuid  references operational_cases(id) on delete set null,
  add column if not exists evidence             text,
  add column if not exists related_entity_type  text,
  add column if not exists related_entity_id    text;

create index if not exists operational_insights_case_idx
  on operational_insights (related_case_id)
  where related_case_id is not null;

create index if not exists operational_insights_entity_idx
  on operational_insights (related_entity_type, related_entity_id)
  where related_entity_type is not null;
