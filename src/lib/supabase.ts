import { createClient } from '@supabase/supabase-js'
import type {
  Project, Task, Decision, Note, Prompt, Handover, ProjectContext,
  Blocker, ArchitectureRule, Document, Approval, ActionLog,
  ProjectMemory, MemoryExtraction,
  ClaudeSession, TimelineEvent, WeeklyReport,
} from '@/types'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await getClient()
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await getClient()
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function createProject(name: string, description: string): Promise<Project> {
  const { data, error } = await getClient()
    .from('projects')
    .insert({ name, description, status: 'active' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProjectState(
  id: string,
  updates: Partial<Pick<Project, 'current_phase' | 'current_status' | 'main_blocker' | 'next_step' | 'risk_level' | 'last_success' | 'status'>>
): Promise<void> {
  const { error } = await getClient()
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(projectId: string): Promise<Task[]> {
  const { data, error } = await getClient()
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTask(
  projectId: string,
  title: string,
  description: string,
  priority: string
): Promise<Task> {
  const { data, error } = await getClient()
    .from('tasks')
    .insert({ project_id: projectId, title, description, priority, status: 'todo' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTaskStatus(id: string, status: string): Promise<void> {
  const { error } = await getClient().from('tasks').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await getClient().from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── Decisions ─────────────────────────────────────────────────────────────────

export async function getDecisions(projectId: string): Promise<Decision[]> {
  const { data, error } = await getClient()
    .from('decisions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createDecision(projectId: string, decision: string): Promise<Decision> {
  const { data, error } = await getClient()
    .from('decisions')
    .insert({ project_id: projectId, decision })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(projectId: string): Promise<Note[]> {
  const { data, error } = await getClient()
    .from('notes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createNote(projectId: string, note: string): Promise<Note> {
  const { data, error } = await getClient()
    .from('notes')
    .insert({ project_id: projectId, note })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export async function getPrompts(projectId: string, limit = 5): Promise<Prompt[]> {
  const { data, error } = await getClient()
    .from('prompts')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function savePrompt(
  projectId: string,
  promptType: string,
  content: string
): Promise<Prompt> {
  const { data, error } = await getClient()
    .from('prompts')
    .insert({ project_id: projectId, prompt_type: promptType, content })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Handovers ─────────────────────────────────────────────────────────────────

export async function getHandovers(projectId: string, limit = 5): Promise<Handover[]> {
  const { data, error } = await getClient()
    .from('handovers')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

export async function saveHandover(projectId: string, content: string): Promise<Handover> {
  const { data, error } = await getClient()
    .from('handovers')
    .insert({ project_id: projectId, content })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Blockers (Phase A) ────────────────────────────────────────────────────────

export async function getBlockers(projectId: string, includeResolved = false): Promise<Blocker[]> {
  let q = getClient()
    .from('blockers')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (!includeResolved) q = q.neq('status', 'resolved')
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ── Architecture Rules (Phase A) ──────────────────────────────────────────────

export async function getArchitectureRules(projectId: string): Promise<ArchitectureRule[]> {
  const { data, error } = await getClient()
    .from('architecture_rules')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createArchitectureRule(
  projectId: string,
  rule: string,
  category: string
): Promise<ArchitectureRule> {
  const { data, error } = await getClient()
    .from('architecture_rules')
    .insert({ project_id: projectId, rule, category })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteArchitectureRule(id: string): Promise<void> {
  const { error } = await getClient().from('architecture_rules').delete().eq('id', id)
  if (error) throw error
}

// ── Documents (Phase B) ───────────────────────────────────────────────────────

export async function getDocuments(projectId: string): Promise<Document[]> {
  const { data, error } = await getClient()
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Approvals (Phase D) ───────────────────────────────────────────────────────

export async function getPendingApprovals(limit = 50): Promise<Approval[]> {
  const { data, error } = await getClient()
    .from('approvals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ── Action Logs (Phase E) ─────────────────────────────────────────────────────

export async function getActionLogs(limit = 20): Promise<ActionLog[]> {
  const { data, error } = await getClient()
    .from('action_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ── Claude Sessions (Phase 1.5) ───────────────────────────────────────────────

export async function getClaudeSessions(projectId: string): Promise<ClaudeSession[]> {
  const { data, error } = await getClient()
    .from('claude_sessions')
    .select('*, results:session_results(*)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Timeline Events (Phase 1.5) ───────────────────────────────────────────────

export async function getTimeline(projectId: string, limit = 50): Promise<TimelineEvent[]> {
  const { data, error } = await getClient()
    .from('project_timeline_events')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ── Weekly Reports (Phase 1.5) ────────────────────────────────────────────────

export async function getWeeklyReports(projectId: string): Promise<WeeklyReport[]> {
  const { data, error } = await getClient()
    .from('weekly_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Memory Ingestion (Phase F) ────────────────────────────────────────────────

export async function getMemories(projectId: string): Promise<ProjectMemory[]> {
  const { data, error } = await getClient()
    .from('project_memories')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getMemoryExtractions(memoryId: string): Promise<MemoryExtraction[]> {
  const { data, error } = await getClient()
    .from('memory_extractions')
    .select('*')
    .eq('memory_id', memoryId)
    .order('confidence', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ── Full project context ───────────────────────────────────────────────────────

export async function getProjectContext(projectId: string): Promise<ProjectContext | null> {
  const project = await getProject(projectId)
  if (!project) return null
  const [tasks, decisions, notes, prompts, handovers, blockers, documents, memories] = await Promise.all([
    getTasks(projectId),
    getDecisions(projectId),
    getNotes(projectId),
    getPrompts(projectId, 3),
    getHandovers(projectId, 3),
    getBlockers(projectId),
    getDocuments(projectId),
    getMemories(projectId),
  ])
  return { project, tasks, decisions, notes, prompts, handovers, blockers, documents, memories }
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<
  { project: Project; latestTask: Task | null; latestDecision: Decision | null }[]
> {
  const projects = await getProjects()
  const results = await Promise.all(
    projects.map(async (project) => {
      const db = getClient()
      const [tasks, decisions] = await Promise.all([
        db
          .from('tasks')
          .select('*')
          .eq('project_id', project.id)
          .neq('status', 'done')
          .order('created_at', { ascending: false })
          .limit(1),
        db
          .from('decisions')
          .select('*')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ])
      return {
        project,
        latestTask: tasks.data?.[0] ?? null,
        latestDecision: decisions.data?.[0] ?? null,
      }
    })
  )
  return results
}
