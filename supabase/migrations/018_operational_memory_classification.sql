-- ── Mission 4 — Operational Memory Classification System ─────────────────────

create table if not exists operational_memory_items (
  id                     uuid        primary key default gen_random_uuid(),
  workspace_id           uuid,
  title                  text        not null,
  content                text        not null default '',
  source_type            text        not null default 'manual',
  memory_layer           text        not null check (memory_layer in ('vault','cases','workflow_memory','think_tank','research','archive')),
  category               text        not null default 'general',
  authority_level        text        not null default 'medium' check (authority_level in ('low','medium','high','very_high')),
  retrieval_priority     integer     not null default 5 check (retrieval_priority between 1 and 10),
  assistant_default_access boolean   not null default true,
  linked_case_id         uuid,
  linked_workflow_id     uuid,
  status                 text        not null default 'active' check (status in ('active','archived')),
  metadata               jsonb       not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists classification_logs (
  id             uuid        primary key default gen_random_uuid(),
  item_id        uuid        references operational_memory_items(id) on delete cascade,
  item_title     text        not null,
  assigned_layer text        not null,
  confidence     numeric(4,3) not null,
  source_type    text        not null default 'manual',
  created_at     timestamptz not null default now()
);

create index if not exists idx_op_mem_items_workspace on operational_memory_items(workspace_id);
create index if not exists idx_op_mem_items_layer     on operational_memory_items(memory_layer);
create index if not exists idx_op_mem_items_access    on operational_memory_items(assistant_default_access);
create index if not exists idx_op_mem_items_status    on operational_memory_items(status);
create index if not exists idx_classification_logs_item on classification_logs(item_id);
create index if not exists idx_classification_logs_layer on classification_logs(assigned_layer);
