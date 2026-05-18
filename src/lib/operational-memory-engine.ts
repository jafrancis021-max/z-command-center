/**
 * operational-memory-engine.ts
 * Deterministic aggregation of operational history into structured memories.
 * No AI calls — pure DB pattern analysis.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Minimum thresholds ────────────────────────────────────────────────────────

const MIN_INBOX_RECURRENCE   = 2   // suggestion_type seen N+ times
const MIN_APPROVAL_RECURRENCE = 2
const MIN_BLOCKER_RECURRENCE  = 2   // blockers per project
const MIN_WORKFLOW_RECURRENCE = 2   // workflow template runs
const MIN_CHAIN_RECURRENCE    = 2   // chain_id runs

// ── Upsert helper ─────────────────────────────────────────────────────────────

interface MemoryPayload {
  key:             string
  memory_type:     string
  title:           string
  summary:         string
  evidence:        Array<Record<string, unknown>>
  confidence:      number
  source_type:     string
  source_ids:      string[]
  recurrence_count: number
  project_id?:     string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertMemory(db: SupabaseClient<any>, payload: MemoryPayload): Promise<'created' | 'updated' | 'skip'> {
  const { data: existing } = await db
    .from('operational_memories')
    .select('id, recurrence_count, first_seen_at')
    .eq('key', payload.key)
    .single()

  const now = new Date().toISOString()

  if (existing) {
    const { error } = await db
      .from('operational_memories')
      .update({
        title:            payload.title,
        summary:          payload.summary,
        evidence:         payload.evidence,
        confidence:       payload.confidence,
        source_ids:       payload.source_ids,
        recurrence_count: Math.max(existing.recurrence_count, payload.recurrence_count),
        last_seen_at:     now,
        status:           'active',
      })
      .eq('id', existing.id)

    return error ? 'skip' : 'updated'
  }

  const { error } = await db
    .from('operational_memories')
    .insert({
      key:             payload.key,
      memory_type:     payload.memory_type,
      title:           payload.title,
      summary:         payload.summary,
      evidence:        payload.evidence,
      confidence:      payload.confidence,
      source_type:     payload.source_type,
      source_ids:      payload.source_ids,
      recurrence_count: payload.recurrence_count,
      project_id:      payload.project_id ?? null,
      first_seen_at:   now,
      last_seen_at:    now,
      status:          'active',
    })

  return error ? 'skip' : 'created'
}

// ── Consolidators ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function consolidateInboxPatterns(db: SupabaseClient<any>): Promise<{ created: number; updated: number }> {
  const { data } = await db
    .from('inbox_workflow_suggestions')
    .select('id, suggestion_type, title, confidence, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as Array<{
    id: string; suggestion_type: string; title: string; confidence: number; created_at: string
  }>

  // Group by suggestion_type
  const groups: Record<string, typeof rows> = {}
  for (const row of rows) {
    if (!groups[row.suggestion_type]) groups[row.suggestion_type] = []
    groups[row.suggestion_type].push(row)
  }

  let created = 0; let updated = 0

  for (const [type, items] of Object.entries(groups)) {
    if (items.length < MIN_INBOX_RECURRENCE) continue

    const avgConf = items.reduce((s, i) => s + i.confidence, 0) / items.length
    const label   = type.replace(/_/g, ' ')
    const result  = await upsertMemory(db, {
      key:             `inbox_pattern:${type}`,
      memory_type:     'inbox_pattern',
      title:           `Recurring "${label}" inbox pattern`,
      summary:         `${items.length} "${label}" suggestions detected from inbox. Avg confidence: ${(avgConf * 100).toFixed(0)}%.`,
      evidence:        items.slice(0, 10).map(i => ({ id: i.id, title: i.title, confidence: i.confidence, created_at: i.created_at })),
      confidence:      Math.min(0.5 + items.length * 0.05, 0.95),
      source_type:     'inbox_workflow_suggestions',
      source_ids:      items.map(i => i.id),
      recurrence_count: items.length,
    })

    if (result === 'created') created++
    else if (result === 'updated') updated++
  }

  return { created, updated }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function consolidateApprovalPatterns(db: SupabaseClient<any>): Promise<{ created: number; updated: number }> {
  const { data } = await db
    .from('approvals')
    .select('id, approval_type, title, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as Array<{
    id: string; approval_type: string; title: string; status: string; created_at: string
  }>

  // Group by approval_type
  const groups: Record<string, typeof rows> = {}
  for (const row of rows) {
    if (!groups[row.approval_type]) groups[row.approval_type] = []
    groups[row.approval_type].push(row)
  }

  let created = 0; let updated = 0

  for (const [type, items] of Object.entries(groups)) {
    if (items.length < MIN_APPROVAL_RECURRENCE) continue

    const approved = items.filter(i => i.status === 'approved').length
    const rejected = items.filter(i => i.status === 'rejected').length
    const pending  = items.filter(i => i.status === 'pending').length
    const label    = type.replace(/_/g, ' ')

    const result = await upsertMemory(db, {
      key:             `approval_pattern:${type}`,
      memory_type:     'approval_pattern',
      title:           `Recurring "${label}" approval pattern`,
      summary:         `${items.length} "${label}" approvals: ${approved} approved, ${rejected} rejected, ${pending} pending.`,
      evidence:        items.slice(0, 10).map(i => ({ id: i.id, title: i.title, status: i.status, created_at: i.created_at })),
      confidence:      Math.min(0.4 + items.length * 0.06, 0.95),
      source_type:     'approvals',
      source_ids:      items.map(i => i.id),
      recurrence_count: items.length,
    })

    if (result === 'created') created++
    else if (result === 'updated') updated++
  }

  return { created, updated }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function consolidateBlockerPatterns(db: SupabaseClient<any>): Promise<{ created: number; updated: number }> {
  const { data } = await db
    .from('blockers')
    .select('id, project_id, title, severity, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as Array<{
    id: string; project_id: string | null; title: string; severity: string; status: string; created_at: string
  }>

  // Group by project_id (use 'global' for null)
  const groups: Record<string, typeof rows> = {}
  for (const row of rows) {
    const key = row.project_id ?? 'global'
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  }

  let created = 0; let updated = 0

  for (const [projectKey, items] of Object.entries(groups)) {
    if (items.length < MIN_BLOCKER_RECURRENCE) continue

    const open     = items.filter(i => i.status !== 'resolved').length
    const critical = items.filter(i => i.severity === 'critical' || i.severity === 'high').length
    const projectId = projectKey === 'global' ? null : projectKey

    const result = await upsertMemory(db, {
      key:             `repeated_blocker:${projectKey}`,
      memory_type:     'repeated_blocker',
      title:           `Repeated blockers${projectId ? ' (project)' : ' (global)'}`,
      summary:         `${items.length} blockers recorded: ${open} currently open, ${critical} high/critical severity.`,
      evidence:        items.slice(0, 10).map(i => ({ id: i.id, title: i.title, severity: i.severity, status: i.status, created_at: i.created_at })),
      confidence:      Math.min(0.4 + items.length * 0.06, 0.9),
      source_type:     'blockers',
      source_ids:      items.map(i => i.id),
      recurrence_count: items.length,
      project_id:      projectId,
    })

    if (result === 'created') created++
    else if (result === 'updated') updated++
  }

  return { created, updated }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function consolidateWorkflowPatterns(db: SupabaseClient<any>): Promise<{ created: number; updated: number }> {
  const { data } = await db
    .from('workflow_runs')
    .select('id, workflow_template_id, status, created_at, workflow_templates(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    workflow_template_id: string
    status: string
    created_at: string
    workflow_templates: { name: string } | null
  }>

  // Group by workflow_template_id
  const groups: Record<string, typeof rows> = {}
  for (const row of rows) {
    if (!groups[row.workflow_template_id]) groups[row.workflow_template_id] = []
    groups[row.workflow_template_id].push(row)
  }

  let created = 0; let updated = 0

  for (const [templateId, items] of Object.entries(groups)) {
    if (items.length < MIN_WORKFLOW_RECURRENCE) continue

    const completed = items.filter(i => i.status === 'completed').length
    const failed    = items.filter(i => i.status === 'failed').length
    const name      = items[0]?.workflow_templates?.name ?? templateId

    const result = await upsertMemory(db, {
      key:             `recurring_workflow:${templateId}`,
      memory_type:     'recurring_workflow',
      title:           `Recurring workflow: ${name}`,
      summary:         `"${name}" run ${items.length} times: ${completed} completed, ${failed} failed.`,
      evidence:        items.slice(0, 10).map(i => ({ id: i.id, status: i.status, created_at: i.created_at })),
      confidence:      Math.min(0.5 + items.length * 0.05, 0.95),
      source_type:     'workflow_runs',
      source_ids:      items.map(i => i.id),
      recurrence_count: items.length,
    })

    if (result === 'created') created++
    else if (result === 'updated') updated++
  }

  return { created, updated }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function consolidateChainPatterns(db: SupabaseClient<any>): Promise<{ created: number; updated: number }> {
  const { data } = await db
    .from('workflow_chain_runs')
    .select('id, workflow_chain_id, status, created_at, workflow_chains(name, trigger_type)')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as Array<{
    id: string
    workflow_chain_id: string
    status: string
    created_at: string
    workflow_chains: { name: string; trigger_type: string } | null
  }>

  // Group by workflow_chain_id
  const groups: Record<string, typeof rows> = {}
  for (const row of rows) {
    if (!groups[row.workflow_chain_id]) groups[row.workflow_chain_id] = []
    groups[row.workflow_chain_id].push(row)
  }

  let created = 0; let updated = 0

  for (const [chainId, items] of Object.entries(groups)) {
    if (items.length < MIN_CHAIN_RECURRENCE) continue

    const completed = items.filter(i => i.status === 'completed').length
    const waiting   = items.filter(i => i.status === 'waiting_approval').length
    const name      = items[0]?.workflow_chains?.name ?? chainId
    const trigger   = items[0]?.workflow_chains?.trigger_type ?? 'unknown'

    const result = await upsertMemory(db, {
      key:             `chain_pattern:${chainId}`,
      memory_type:     'chain_pattern',
      title:           `Recurring chain: ${name}`,
      summary:         `"${name}" (trigger: ${trigger}) activated ${items.length} times: ${completed} completed, ${waiting} awaiting approval.`,
      evidence:        items.slice(0, 10).map(i => ({ id: i.id, status: i.status, created_at: i.created_at })),
      confidence:      Math.min(0.5 + items.length * 0.08, 0.95),
      source_type:     'workflow_chain_runs',
      source_ids:      items.map(i => i.id),
      recurrence_count: items.length,
    })

    if (result === 'created') created++
    else if (result === 'updated') updated++
  }

  return { created, updated }
}

// ── Main consolidation runner ─────────────────────────────────────────────────

export interface ConsolidationResult {
  created: number
  updated: number
  by_type: Record<string, { created: number; updated: number }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runOperationalMemoryConsolidation(db: SupabaseClient<any>): Promise<ConsolidationResult> {
  const [inbox, approvals, blockers, workflows, chains] = await Promise.all([
    consolidateInboxPatterns(db),
    consolidateApprovalPatterns(db),
    consolidateBlockerPatterns(db),
    consolidateWorkflowPatterns(db),
    consolidateChainPatterns(db),
  ])

  const total = {
    created: inbox.created + approvals.created + blockers.created + workflows.created + chains.created,
    updated: inbox.updated + approvals.updated + blockers.updated + workflows.updated + chains.updated,
    by_type: {
      inbox_pattern:      inbox,
      approval_pattern:   approvals,
      repeated_blocker:   blockers,
      recurring_workflow: workflows,
      chain_pattern:      chains,
    },
  }

  return total
}
