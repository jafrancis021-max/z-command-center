export type ProjectStatus = 'active' | 'paused' | 'archived'
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  // Phase A operational fields
  current_phase: string | null
  current_status: string | null
  main_blocker: string | null
  next_step: string | null
  risk_level: RiskLevel | null
  last_success: string | null
  updated_at: string | null
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  created_at: string
}

export interface Decision {
  id: string
  project_id: string
  decision: string
  created_at: string
}

export interface Note {
  id: string
  project_id: string
  note: string
  created_at: string
}

export interface Prompt {
  id: string
  project_id: string
  prompt_type: string
  content: string
  created_at: string
}

export interface Handover {
  id: string
  project_id: string
  content: string
  created_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Phase A
export interface Blocker {
  id: string
  project_id: string
  title: string
  description: string | null
  severity: Severity
  status: 'open' | 'in_progress' | 'resolved'
  resolved_at: string | null
  created_at: string
}

export interface ArchitectureRule {
  id: string
  project_id: string
  rule: string
  category: string
  created_at: string
}

export interface ProjectTimeline {
  id: string
  project_id: string
  event_type: string
  title: string
  description: string | null
  created_at: string
}

// Phase B
export interface Document {
  id: string
  project_id: string | null
  file_name: string
  file_url: string | null
  file_type: string
  file_size_bytes: number | null
  extracted_text: string | null
  summary: string | null
  created_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  project_id: string | null
  chunk_index: number
  chunk_text: string
  metadata: Record<string, unknown>
  created_at: string
}

// Phase D
export interface Approval {
  id: string
  approval_type: string
  title: string
  description: string | null
  payload: Record<string, unknown>
  project_id: string | null
  entity_type: string | null
  entity_id: string | null
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  rejection_note: string | null
  approved_at: string | null
  created_at: string
}

// Phase E
export interface ActionLog {
  id: string
  action_type: string
  entity_type: string | null
  entity_id: string | null
  project_id: string | null
  summary: string | null
  status: 'completed' | 'failed' | 'pending'
  error_message: string | null
  duration_ms: number | null
  created_at: string
}

export interface Workflow {
  id: string
  name: string
  description: string | null
  trigger_type: string
  steps: Array<{ type: string; name: string; config?: Record<string, unknown> }>
  is_active: boolean
  created_at: string
}

// Phase 2A — Workflow Engine + Operational Feed
export type WorkflowStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type FeedSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface WorkflowTemplate {
  id: string
  name: string
  description: string | null
  category: string
  project_scoped: boolean
  input_schema: Record<string, unknown>
  steps: Array<{ name: string; description?: string }>
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface WorkflowRun {
  id: string
  workflow_template_id: string
  project_id: string | null
  status: WorkflowStatus
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  template?: WorkflowTemplate
  steps?: WorkflowRunStep[]
}

export interface WorkflowRunStep {
  id: string
  workflow_run_id: string
  step_index: number
  step_name: string
  status: StepStatus
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface FeedEvent {
  id: string
  project_id: string | null
  event_type: string
  title: string
  description: string | null
  severity: FeedSeverity
  source_table: string | null
  source_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  project_name?: string
}

// Phase 1.5 — Operational Intelligence
export type SessionType = 'build' | 'fix' | 'refactor' | 'deploy' | 'investigate' | 'other'
export type SessionStatus = 'pending' | 'success' | 'failed' | 'partial' | 'rolled_back'
export type HealthStatus = 'STRONG' | 'ACTIVE' | 'STALLED' | 'AT_RISK'

export interface ClaudeSession {
  id: string
  project_id: string | null
  prompt: string
  session_type: SessionType
  status: SessionStatus
  created_at: string
  results?: SessionResult[]
}

export interface SessionResult {
  id: string
  session_id: string
  summary: string | null
  outcome: string | null
  files_changed: string[] | null
  success: boolean
  rollback_notes: string | null
  created_at: string
}

export interface TimelineEvent {
  id: string
  project_id: string
  event_type: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface WeeklyReport {
  id: string
  project_id: string | null
  report_text: string
  created_at: string
}

export interface ProjectHealth {
  project_id: string
  project_name: string
  status: HealthStatus
  score: number
  reasons: string[]
}

export interface SearchResult {
  id: string
  type: 'memory' | 'note' | 'blocker' | 'handover' | 'prompt' | 'architecture_rule' | 'timeline' | 'session' | 'decision'
  project_id: string | null
  project_name?: string
  title: string
  snippet: string
  created_at: string
}

// Phase F — Memory Ingestion
export type IngestionStatus = 'pending' | 'processing' | 'complete' | 'failed'
export type SourceType = 'upload' | 'paste' | 'handover' | 'transcript' | 'architecture' | 'log' | 'strategy'
export type ExtractionType = 'decision' | 'blocker' | 'next_step' | 'architecture_rule' | 'warning' | 'milestone'

export interface ProjectMemory {
  id: string
  project_id: string | null
  title: string
  source_type: SourceType
  raw_text: string
  summary: string | null
  ingestion_status: IngestionStatus
  created_at: string
}

export interface MemoryChunk {
  id: string
  memory_id: string
  project_id: string | null
  chunk_index: number
  chunk_text: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface MemoryExtraction {
  id: string
  memory_id: string
  project_id: string | null
  extraction_type: ExtractionType
  content: string
  confidence: number
  created_at: string
}

export interface ProjectContext {
  project: Project
  tasks: Task[]
  decisions: Decision[]
  notes: Note[]
  prompts: Prompt[]
  handovers: Handover[]
  blockers: Blocker[]
  documents: Document[]
  memories: ProjectMemory[]
}

// Phase 2B — Gmail Integration
export interface EmailAccount {
  id: string
  email_address: string
  display_name: string | null
  provider: string
  access_token: string
  refresh_token: string | null
  token_expiry: string | null
  scopes: string[] | null
  status: 'active' | 'expired' | 'disconnected'
  last_synced_at: string | null
  created_at: string
}

export interface Email {
  id: string
  account_id: string
  gmail_id: string
  thread_id: string | null
  subject: string | null
  sender_email: string | null
  sender_name: string | null
  recipient_emails: string[] | null
  snippet: string | null
  body_text: string | null
  received_at: string | null
  is_read: boolean
  labels: string[] | null
  category: string
  urgency: string
  linked_project_id: string | null
  requires_action: boolean
  created_at: string
}

export interface EmailTriageResult {
  id: string
  email_id: string
  classification: string | null
  project_id: string | null
  extracted_tasks: Record<string, unknown>[] | null
  summary: string | null
  priority_score: number | null
  reasoning: string | null
  urgency: string | null
  suggested_reply: string | null
  confidence: number | null
  created_at: string
}

export interface EmailDraft {
  id: string
  email_id: string
  account_id: string | null
  to_address: string | null
  subject: string | null
  body: string
  context_note: string | null
  status: string
  approved_at: string | null
  linked_project_id: string | null
  created_at: string
}

// ── Phase 2C — Scheduled Operational Engine ───────────────────────────────────

export type JobStatus    = 'active' | 'paused' | 'failed'
export type JobRunStatus = 'running' | 'success' | 'failed'
export type JobLogLevel  = 'info' | 'warn' | 'error'

export interface ScheduledJob {
  id:                        string
  job_type:                  string
  name:                      string
  description:               string | null
  schedule_interval_minutes: number
  status:                    JobStatus
  last_run_at:               string | null
  next_run_at:               string
  config:                    Record<string, unknown>
  created_at:                string
  updated_at:                string
}

export interface JobRun {
  id:                string
  scheduled_job_id:  string
  job_type:          string
  status:            JobRunStatus
  started_at:        string
  finished_at:       string | null
  duration_ms:       number | null
  error_message:     string | null
  result:            Record<string, unknown> | null
  created_at:        string
}

export interface JobLog {
  id:         string
  job_run_id: string
  level:      JobLogLevel
  message:    string
  metadata:   Record<string, unknown>
  created_at: string
}

export interface JobResult {
  ok:                      boolean
  message:                 string
  actions_taken:           string[]
  next_recommended_action: string
}

// ── Phase 2C Step 3 — Inbox-to-Workflow Automation ───────────────────────────

export type SuggestionType =
  | 'approval_needed'
  | 'follow_up_needed'
  | 'blocker_detected'
  | 'task_candidate'
  | 'handover_candidate'
  | 'meeting_candidate'
  | 'document_request'
  | 'unknown'

export type SuggestionStatus = 'suggested' | 'approved' | 'rejected' | 'executed'

export interface SuggestedAction {
  type:        string
  label:       string
  description: string
}

export interface InboxWorkflowSuggestion {
  id:                string
  email_id:          string
  project_id:        string | null
  suggestion_type:   SuggestionType
  title:             string
  description:       string | null
  confidence:        number
  status:            SuggestionStatus
  suggested_actions: SuggestedAction[]
  source:            string
  created_at:        string
  updated_at:        string
  // joined
  email_subject:     string | null
  email_sender:      string | null
}

// ── Phase 2C Step 6 — Notifications ──────────────────────────────────────────

export type NotificationSeverity = 'info' | 'warning' | 'critical'

export interface Notification {
  id:          string
  type:        string
  severity:    NotificationSeverity
  title:       string
  message:     string
  source_type: string | null
  source_id:   string | null
  action_url:  string | null
  key:         string | null
  read:        boolean
  dismissed:   boolean
  metadata:    Record<string, unknown>
  created_at:  string
}

// ── Phase 2C Step 5 — Operational Memory ─────────────────────────────────────

export type MemoryType =
  | 'recurring_workflow'
  | 'repeated_blocker'
  | 'approval_pattern'
  | 'inbox_pattern'
  | 'chain_pattern'
  | 'project_context'
  | 'operational_risk'

export type MemoryStatus = 'active' | 'archived'

export interface OperationalMemory {
  id:               string
  project_id:       string | null
  memory_type:      MemoryType
  key:              string | null
  title:            string
  summary:          string
  evidence:         Array<Record<string, unknown>>
  confidence:       number
  source_type:      string
  source_ids:       string[]
  recurrence_count: number
  first_seen_at:    string
  last_seen_at:     string
  status:           MemoryStatus
  created_at:       string
  updated_at:       string
}

// ── Phase 2C Step 4 — Workflow Chaining ───────────────────────────────────────

// ── Phase 3A — Multi-Tenant Foundation ───────────────────────────────────────

export type OrgStatus       = 'active' | 'suspended' | 'archived'
export type WorkspaceStatus = 'active' | 'archived'
export type MemberRole      = 'owner' | 'admin' | 'operator' | 'viewer'

export interface Organization {
  id:         string
  name:       string
  slug:       string
  status:     OrgStatus
  created_at: string
  updated_at: string
}

export interface Workspace {
  id:              string
  organization_id: string
  name:            string
  slug:            string
  status:          WorkspaceStatus
  created_at:      string
  updated_at:      string
}

export interface Profile {
  id:         string
  email:      string
  full_name:  string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceMembership {
  id:           string
  workspace_id: string
  user_id:      string
  role:         MemberRole
  created_at:   string
}

export interface AuditLog {
  id:           string
  workspace_id: string | null
  actor_id:     string | null
  action:       string
  target_type:  string | null
  target_id:    string | null
  metadata:     Record<string, unknown>
  created_at:   string
}

export interface WorkspaceContext {
  organization: Organization | null
  workspace:    Pick<Workspace, 'id' | 'name' | 'slug' | 'status'>
  role:         MemberRole
}

// ── Browser Execution Sandbox ─────────────────────────────────────────────────

export type BrowserRunStatus  = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed'
export type BrowserRunMode    = 'visible' | 'headless'
export type BrowserStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type BrowserActionType =
  | 'open_url'
  | 'screenshot'
  | 'extract_title'
  | 'fill_field'
  | 'click_button'
  | 'wait_approval'

export interface BrowserExecutionRun {
  id:                    string
  workspace_id:          string | null
  workflow_chain_run_id: string | null
  status:                BrowserRunStatus
  mode:                  BrowserRunMode
  target_url:            string
  task_description:      string
  result:                Record<string, unknown> | null
  error_message:         string | null
  created_at:            string
  updated_at:            string
  steps?:                BrowserExecutionStep[]
}

export interface BrowserExecutionStep {
  id:              string
  run_id:          string
  step_order:      number
  action_type:     BrowserActionType
  description:     string
  status:          BrowserStepStatus
  screenshot_path: string | null
  metadata:        Record<string, unknown>
  created_at:      string
}

// ── Mission 4 — Operational Memory Classification ────────────────────────────

export type MemoryLayer      = 'vault' | 'cases' | 'workflow_memory' | 'think_tank' | 'research' | 'archive'
export type AuthorityLevel   = 'low' | 'medium' | 'high' | 'very_high'
export type MemoryMode       = 'working' | 'episodic' | 'semantic' | 'procedural' | 'speculative' | 'runtime'
export type TemperatureTier  = 'hot' | 'warm' | 'cold'
export type RetrievalIntent  = 'working' | 'episodic' | 'semantic' | 'procedural' | 'runtime' | 'speculative'

export interface ClassificationResult {
  memory_layer:             MemoryLayer
  memory_mode:              MemoryMode
  category:                 string
  authority_level:          AuthorityLevel
  retrieval_priority:       number
  assistant_default_access: boolean
  temperature_tier:         TemperatureTier
  status:                   'active'
}

export interface OperationalMemoryItem {
  id:                       string
  workspace_id:             string | null
  title:                    string
  content:                  string
  source_type:              string
  memory_layer:             MemoryLayer
  memory_mode:              MemoryMode
  category:                 string
  authority_level:          AuthorityLevel
  retrieval_priority:       number
  assistant_default_access: boolean
  temperature_tier:         TemperatureTier
  recency_score:            number
  trust_score:              number
  workflow_relevance_score: number
  retrieval_decay_factor:   number
  linked_case_id:           string | null
  linked_workflow_id:       string | null
  status:                   'active' | 'archived'
  metadata:                 Record<string, unknown>
  created_at:               string
  updated_at:               string
}

export interface ClassificationLog {
  id:             string
  item_id:        string | null
  item_title:     string
  assigned_layer: MemoryLayer
  confidence:     number
  source_type:    string
  created_at:     string
}

// ─────────────────────────────────────────────────────────────────────────────

export type ChainStatus = 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed'

export interface WorkflowChain {
  id:           string
  name:         string
  description:  string | null
  trigger_type: string
  status:       'active' | 'paused'
  config:       Record<string, unknown>
  created_at:   string
  updated_at:   string
}

export interface WorkflowChainStep {
  id:                string
  workflow_chain_id: string
  step_order:        number
  step_type:         string
  title:             string
  description:       string | null
  requires_approval: boolean
  config:            Record<string, unknown>
  created_at:        string
}

export interface WorkflowChainRun {
  id:                string
  workflow_chain_id: string
  source_type:       string
  source_id:         string
  status:            ChainStatus
  current_step:      number
  result:            Record<string, unknown>
  error_message:     string | null
  created_at:        string
  updated_at:        string
  // joined via FK workflow_chain_id → workflow_chains.id
  workflow_chains?:  { name: string; trigger_type: string } | null
}
