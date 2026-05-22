// Deterministic case-linking engine — no AI inference
// All matching is keyword/overlap-based; confidence scores are purely algorithmic

import { getAdmin, logAction } from './supabase-server'
import { detectCategory } from './intake-processor'

// ── Input types ───────────────────────────────────────────────────────────────

export interface EmailRecord {
  id:            string
  subject?:      string | null
  sender_email?: string | null
  snippet?:      string | null
  body_text?:    string | null
  category?:     string | null
  received_at?:  string | null
}

export interface ApprovalRecord {
  id:            string
  title:         string
  description?:  string | null
  approval_type: string
  entity_type?:  string | null
  entity_id?:    string | null
}

export interface WorkflowSuggestionRecord {
  id:               string
  title:            string
  description?:     string | null
  email_id?:        string | null
  suggestion_type?: string | null
}

export interface CaseInference {
  case_id:    string | null
  confidence: number
  method:     'exact_match' | 'fuzzy_match' | 'keyword_match' | 'entity_trace' | 'no_match'
  reason:     string
}

export interface LinkResult {
  case_id:    string
  created:    boolean
  method:     string
  confidence: number
}

// ── Word overlap scoring ──────────────────────────────────────────────────────

function wordOverlap(a: string, b: string): number {
  const clean  = (s: string) => s.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  const wordsA = clean(a)
  const setB   = new Set(clean(b))
  if (wordsA.length === 0 || setB.size === 0) return 0
  const matches = wordsA.filter(w => setB.has(w)).length
  return matches / Math.max(wordsA.length, setB.size)
}

// ── Create link (duplicate-safe) ──────────────────────────────────────────────

export async function createCaseLinkSafe(
  caseId:     string,
  entityType: string,
  entityId:   string,
  linkType    = 'related',
  notes?:     string,
): Promise<boolean> {
  const db = getAdmin()
  const { data: existing } = await db
    .from('case_links')
    .select('id')
    .eq('case_id',     caseId)
    .eq('entity_type', entityType)
    .eq('entity_id',   entityId)
    .limit(1)

  if (existing && existing.length > 0) return false

  const { error } = await db.from('case_links').insert({
    case_id:     caseId,
    entity_type: entityType,
    entity_id:   entityId,
    link_type:   linkType,
    notes:       notes ?? null,
  })
  return !error
}

// ── Email inference ───────────────────────────────────────────────────────────

export async function inferCaseFromEmail(
  email:       EmailRecord,
  workspaceId: string | null,
): Promise<CaseInference> {
  const db = getAdmin()

  // Already linked?
  const { data: existing } = await db
    .from('case_links')
    .select('case_id')
    .eq('entity_type', 'email')
    .eq('entity_id',   email.id)
    .limit(1)
  if (existing && existing.length > 0) {
    return { case_id: (existing[0] as { case_id: string }).case_id, confidence: 100, method: 'exact_match', reason: 'Already linked' }
  }

  // Fetch recent active cases for matching
  let q = db
    .from('operational_cases')
    .select('id, title, type')
    .in('status', ['open', 'in_progress'])
    .order('updated_at', { ascending: false })
    .limit(40)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data: cases } = await q

  type CaseRow = { id: string; title: string; type: string }
  const subject = email.subject ?? ''
  const body    = (email.snippet ?? email.body_text ?? '').slice(0, 400)

  let bestId = '', bestScore = 0, bestReason = ''
  for (const c of (cases ?? []) as CaseRow[]) {
    const titleScore  = wordOverlap(subject, c.title)
    const bodyScore   = wordOverlap(body, c.title) * 0.6
    const score       = Math.max(titleScore, bodyScore)
    if (score > bestScore) {
      bestScore  = score
      bestId     = c.id
      bestReason = `${Math.round(score * 100)}% word overlap with case "${c.title}"`
    }
  }

  if (bestScore >= 0.3 && bestId) {
    return { case_id: bestId, confidence: Math.round(bestScore * 100), method: 'fuzzy_match', reason: bestReason }
  }
  return { case_id: null, confidence: 0, method: 'no_match', reason: `Best match was ${Math.round(bestScore * 100)}% — below 30% threshold` }
}

export async function findOrCreateCaseForEmail(
  email:       EmailRecord,
  workspaceId: string | null,
): Promise<LinkResult> {
  const db        = getAdmin()
  const inference = await inferCaseFromEmail(email, workspaceId)

  if (inference.case_id) {
    const linked = await createCaseLinkSafe(inference.case_id, 'email', email.id, 'related')
    if (linked) {
      await logAction({ action_type: 'case_link_email', entity_type: 'email', entity_id: email.id, summary: `Email linked to case via ${inference.method} (${inference.confidence}%)`, output: { case_id: inference.case_id, method: inference.method, confidence: inference.confidence }, status: 'completed' })
    }
    return { case_id: inference.case_id, created: false, method: inference.method, confidence: inference.confidence }
  }

  // Create new case from email
  const subject   = (email.subject ?? 'Email intake').slice(0, 200)
  const category  = detectCategory(subject, email.snippet ?? email.body_text ?? null)
  const caseType  = category === 'claim' ? 'claim' : category === 'contract' ? 'contract' : category === 'compliance' ? 'compliance' : category === 'invoice' ? 'invoice' : 'correspondence'

  const { data: newCase, error } = await db.from('operational_cases').insert({
    title:        subject,
    type:         caseType,
    status:       'open',
    priority:     'medium',
    source:       'email',
    workspace_id: workspaceId,
    metadata:     { auto_created: true, email_id: email.id },
  }).select('id').single()

  if (error || !newCase) throw new Error(`Failed to create case: ${error?.message ?? 'unknown'}`)

  const caseId = (newCase as { id: string }).id
  await createCaseLinkSafe(caseId, 'email', email.id, 'related')
  await logAction({ action_type: 'case_created_from_email', entity_type: 'operational_case', entity_id: caseId, summary: `Case auto-created from email: "${subject}"`, output: { category, email_id: email.id }, status: 'completed' })

  return { case_id: caseId, created: true, method: 'new_case', confidence: 100 }
}

export async function linkEmailToCase(
  emailId:    string,
  caseId:     string,
  method:     string,
  confidence: number,
): Promise<boolean> {
  const linked = await createCaseLinkSafe(caseId, 'email', emailId, 'related', `method: ${method}, confidence: ${confidence}%`)
  if (linked) {
    await logAction({ action_type: 'case_link_email', entity_type: 'email', entity_id: emailId, summary: `Email manually linked to case`, output: { case_id: caseId, method, confidence }, status: 'completed' })
  }
  return linked
}

// ── Approval inference ────────────────────────────────────────────────────────

export async function findCaseForApproval(
  approval:    ApprovalRecord,
  workspaceId: string | null,
): Promise<CaseInference> {
  const db = getAdmin()

  // Already linked?
  const { data: existing } = await db.from('case_links').select('case_id').eq('entity_type', 'approval').eq('entity_id', approval.id).limit(1)
  if (existing && existing.length > 0) {
    return { case_id: (existing[0] as { case_id: string }).case_id, confidence: 100, method: 'exact_match', reason: 'Already linked' }
  }

  // Trace via entity: approval → intake_document → case
  if (approval.entity_type === 'intake_document' && approval.entity_id) {
    const { data: doc } = await db.from('intake_documents').select('case_id').eq('id', approval.entity_id).single()
    const caseId = (doc as { case_id: string | null } | null)?.case_id
    if (caseId) return { case_id: caseId, confidence: 90, method: 'entity_trace', reason: 'Traced via intake_document link' }
  }

  // Trace via entity: approval → email → case_link
  if (approval.entity_type === 'email' && approval.entity_id) {
    const { data: link } = await db.from('case_links').select('case_id').eq('entity_type', 'email').eq('entity_id', approval.entity_id).limit(1)
    if (link && link.length > 0) {
      return { case_id: (link[0] as { case_id: string }).case_id, confidence: 85, method: 'entity_trace', reason: 'Traced via linked email' }
    }
  }

  // Fuzzy match approval title to case titles
  let q = db.from('operational_cases').select('id, title').in('status', ['open', 'in_progress', 'pending_approval']).order('updated_at', { ascending: false }).limit(30)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data: cases } = await q

  type CaseRow = { id: string; title: string }
  let bestId = '', bestScore = 0, bestReason = ''
  for (const c of (cases ?? []) as CaseRow[]) {
    const score = wordOverlap(approval.title, c.title)
    if (score > bestScore) { bestScore = score; bestId = c.id; bestReason = `${Math.round(score * 100)}% overlap with "${c.title}"` }
  }

  if (bestScore >= 0.3 && bestId) return { case_id: bestId, confidence: Math.round(bestScore * 100), method: 'fuzzy_match', reason: bestReason }
  return { case_id: null, confidence: 0, method: 'no_match', reason: `No case matched (best: ${Math.round(bestScore * 100)}%)` }
}

export async function linkApprovalToCase(
  approvalId:  string,
  caseId:      string,
  method:      string,
  confidence:  number,
): Promise<void> {
  const linked = await createCaseLinkSafe(caseId, 'approval', approvalId, 'related', `${method} (${confidence}%)`)
  if (linked) await logAction({ action_type: 'case_link_approval', entity_type: 'approval', entity_id: approvalId, summary: `Approval linked to case via ${method}`, output: { case_id: caseId, confidence }, status: 'completed' })
}

// ── Workflow suggestion inference ─────────────────────────────────────────────

export async function findCaseForWorkflowSuggestion(
  suggestion:  WorkflowSuggestionRecord,
  workspaceId: string | null,
): Promise<CaseInference> {
  const db = getAdmin()

  // Already linked?
  const { data: existing } = await db.from('case_links').select('case_id').eq('entity_type', 'inbox_workflow_suggestion').eq('entity_id', suggestion.id).limit(1)
  if (existing && existing.length > 0) {
    return { case_id: (existing[0] as { case_id: string }).case_id, confidence: 100, method: 'exact_match', reason: 'Already linked' }
  }

  // Trace via email_id
  if (suggestion.email_id) {
    const { data: link } = await db.from('case_links').select('case_id').eq('entity_type', 'email').eq('entity_id', suggestion.email_id).limit(1)
    if (link && link.length > 0) {
      return { case_id: (link[0] as { case_id: string }).case_id, confidence: 88, method: 'entity_trace', reason: 'Traced via linked email' }
    }
  }

  // Fuzzy match
  let q = db.from('operational_cases').select('id, title').in('status', ['open', 'in_progress']).order('updated_at', { ascending: false }).limit(30)
  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  const { data: cases } = await q

  type CaseRow = { id: string; title: string }
  let bestId = '', bestScore = 0, bestReason = ''
  for (const c of (cases ?? []) as CaseRow[]) {
    const score = wordOverlap(suggestion.title, c.title)
    if (score > bestScore) { bestScore = score; bestId = c.id; bestReason = `${Math.round(score * 100)}% overlap with "${c.title}"` }
  }

  if (bestScore >= 0.3 && bestId) return { case_id: bestId, confidence: Math.round(bestScore * 100), method: 'fuzzy_match', reason: bestReason }
  return { case_id: null, confidence: 0, method: 'no_match', reason: `No match (best: ${Math.round(bestScore * 100)}%)` }
}

export async function linkWorkflowSuggestionToCase(
  suggestionId: string,
  caseId:       string,
  method:       string,
  confidence:   number,
): Promise<void> {
  const linked = await createCaseLinkSafe(caseId, 'inbox_workflow_suggestion', suggestionId, 'related', `${method} (${confidence}%)`)
  if (linked) await logAction({ action_type: 'case_link_workflow_suggestion', entity_type: 'inbox_workflow_suggestion', entity_id: suggestionId, summary: `Workflow suggestion linked to case via ${method}`, output: { case_id: caseId, confidence }, status: 'completed' })
}

// ── Notification inference ────────────────────────────────────────────────────

export interface NotificationRecord {
  id:           string
  source_type?: string | null
  source_id?:   string | null
  type?:        string | null
}

// Maps notifications.source_type to the entity_type used in case_links
const NOTIFICATION_SOURCE_ENTITY_MAP: Record<string, string> = {
  approvals:                  'approval',
  workflow_chain_runs:        'workflow_chain_run',
  operational_memories:       'operational_memory',
  emails:                     'email',
  browser_execution_runs:     'browser_execution_run',
  inbox_workflow_suggestions: 'inbox_workflow_suggestion',
  intake_documents:           'intake_document',
}

export async function findCaseForNotification(
  notification: NotificationRecord,
  workspaceId:  string | null,
): Promise<CaseInference> {
  const db = getAdmin()

  // Already linked?
  const { data: existing } = await db
    .from('case_links')
    .select('case_id')
    .eq('entity_type', 'notification')
    .eq('entity_id',   notification.id)
    .limit(1)
  if (existing && existing.length > 0) {
    return { case_id: (existing[0] as { case_id: string }).case_id, confidence: 100, method: 'exact_match', reason: 'Already linked' }
  }

  // Trace via source_type + source_id → case_links
  if (notification.source_type && notification.source_id) {
    const entityType = NOTIFICATION_SOURCE_ENTITY_MAP[notification.source_type]
    if (entityType) {
      const { data: link } = await db
        .from('case_links')
        .select('case_id')
        .eq('entity_type', entityType)
        .eq('entity_id',   notification.source_id)
        .limit(1)
      if (link && link.length > 0) {
        return {
          case_id:    (link[0] as { case_id: string }).case_id,
          confidence: 90,
          method:     'entity_trace',
          reason:     `Traced via ${notification.source_type}/${notification.source_id}`,
        }
      }
    }

    // Special: source is intake_documents → check case_id directly
    if (notification.source_type === 'intake_documents') {
      const { data: doc } = await db
        .from('intake_documents')
        .select('case_id')
        .eq('id', notification.source_id)
        .single()
      const caseId = (doc as { case_id: string | null } | null)?.case_id
      if (caseId) {
        return { case_id: caseId, confidence: 88, method: 'entity_trace', reason: 'Traced via intake_document.case_id' }
      }
    }
  }

  void workspaceId // no fuzzy fallback for notifications — keep conservative
  return { case_id: null, confidence: 0, method: 'no_match', reason: 'No case link found for notification source' }
}

export async function linkNotificationToCase(
  notificationId: string,
  caseId:         string,
  method:         string,
  confidence:     number,
): Promise<void> {
  const linked = await createCaseLinkSafe(caseId, 'notification', notificationId, 'related', `${method} (${confidence}%)`)
  if (linked) {
    await logAction({
      action_type: 'case_link_notification',
      entity_type: 'notification',
      entity_id:   notificationId,
      summary:     `Notification linked to case via ${method}`,
      output:      { case_id: caseId, confidence },
      status:      'completed',
    })
  }
}
