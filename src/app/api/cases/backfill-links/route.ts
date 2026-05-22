import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import {
  findOrCreateCaseForEmail,
  inferCaseFromEmail,
  linkApprovalToCase,
  linkWorkflowSuggestionToCase,
  findCaseForApproval,
  findCaseForWorkflowSuggestion,
  findCaseForNotification,
  linkNotificationToCase,
  type EmailRecord,
  type ApprovalRecord,
  type WorkflowSuggestionRecord,
  type NotificationRecord,
} from '@/lib/case-linking-engine'

export const dynamic = 'force-dynamic'

interface BackfillResult {
  entity_type: string
  entity_id:   string
  case_id:     string | null
  method:      string
  confidence:  number
  action:      'linked' | 'skipped' | 'created_case' | 'no_match'
}

export async function POST(request: NextRequest) {
  const url    = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') !== 'false'

  const db          = getAdmin()
  const workspaceId = await getCurrentWorkspaceId()

  const results: BackfillResult[] = []
  const errors:  string[]         = []

  // ── Emails without any case link ─────────────────────────────────────────────
  try {
    let q = db
      .from('emails')
      .select('id, subject, sender_email, snippet, body_text, category, received_at')
      .order('received_at', { ascending: false })
      .limit(100)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: emails } = await q

    for (const email of (emails ?? []) as EmailRecord[]) {
      // Check if already linked
      const { data: existing } = await db
        .from('case_links')
        .select('id')
        .eq('entity_type', 'email')
        .eq('entity_id',   email.id)
        .limit(1)
      if (existing && existing.length > 0) continue

      if (dryRun) {
        const inf = await inferCaseFromEmail(email, workspaceId)
        results.push({
          entity_type: 'email',
          entity_id:   email.id,
          case_id:     inf.case_id,
          method:      inf.method,
          confidence:  inf.confidence,
          action:      inf.case_id ? 'linked' : 'no_match',
        })
      } else {
        try {
          const result = await findOrCreateCaseForEmail(email, workspaceId)
          results.push({
            entity_type: 'email',
            entity_id:   email.id,
            case_id:     result.case_id,
            method:      result.method,
            confidence:  result.confidence,
            action:      result.created ? 'created_case' : 'linked',
          })
        } catch (e) {
          errors.push(`email ${email.id}: ${e instanceof Error ? e.message : 'unknown'}`)
        }
      }
    }
  } catch (e) {
    errors.push(`emails scan: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  // ── Approvals without any case link ──────────────────────────────────────────
  try {
    const { data: approvals } = await db
      .from('approvals')
      .select('id, title, description, approval_type, entity_type, entity_id')
      .order('created_at', { ascending: false })
      .limit(50)

    for (const approval of (approvals ?? []) as ApprovalRecord[]) {
      const { data: existing } = await db
        .from('case_links')
        .select('id')
        .eq('entity_type', 'approval')
        .eq('entity_id',   approval.id)
        .limit(1)
      if (existing && existing.length > 0) continue

      const inf = await findCaseForApproval(approval, workspaceId)
      if (!inf.case_id) {
        results.push({ entity_type: 'approval', entity_id: approval.id, case_id: null, method: inf.method, confidence: 0, action: 'no_match' })
        continue
      }

      if (!dryRun) {
        try {
          await linkApprovalToCase(approval.id, inf.case_id, inf.method, inf.confidence)
        } catch (e) {
          errors.push(`approval ${approval.id}: ${e instanceof Error ? e.message : 'unknown'}`)
          continue
        }
      }
      results.push({
        entity_type: 'approval',
        entity_id:   approval.id,
        case_id:     inf.case_id,
        method:      inf.method,
        confidence:  inf.confidence,
        action:      'linked',
      })
    }
  } catch (e) {
    errors.push(`approvals scan: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  // ── Workflow suggestions without any case link ────────────────────────────────
  try {
    const { data: suggestions } = await db
      .from('inbox_workflow_suggestions')
      .select('id, title, description, email_id, suggestion_type')
      .order('created_at', { ascending: false })
      .limit(50)

    for (const suggestion of (suggestions ?? []) as WorkflowSuggestionRecord[]) {
      const { data: existing } = await db
        .from('case_links')
        .select('id')
        .eq('entity_type', 'inbox_workflow_suggestion')
        .eq('entity_id',   suggestion.id)
        .limit(1)
      if (existing && existing.length > 0) continue

      const inf = await findCaseForWorkflowSuggestion(suggestion, workspaceId)
      if (!inf.case_id) {
        results.push({ entity_type: 'inbox_workflow_suggestion', entity_id: suggestion.id, case_id: null, method: inf.method, confidence: 0, action: 'no_match' })
        continue
      }

      if (!dryRun) {
        try {
          await linkWorkflowSuggestionToCase(suggestion.id, inf.case_id, inf.method, inf.confidence)
        } catch (e) {
          errors.push(`suggestion ${suggestion.id}: ${e instanceof Error ? e.message : 'unknown'}`)
          continue
        }
      }
      results.push({
        entity_type: 'inbox_workflow_suggestion',
        entity_id:   suggestion.id,
        case_id:     inf.case_id,
        method:      inf.method,
        confidence:  inf.confidence,
        action:      'linked',
      })
    }
  } catch (e) {
    errors.push(`workflow suggestions scan: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  // ── Notifications without any case link ─────────────────────────────────────
  try {
    const { data: notifications } = await db
      .from('notifications')
      .select('id, source_type, source_id, type')
      .not('source_type', 'is', null)
      .not('source_id',   'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    for (const notif of (notifications ?? []) as NotificationRecord[]) {
      const { data: existing } = await db
        .from('case_links')
        .select('id')
        .eq('entity_type', 'notification')
        .eq('entity_id',   notif.id)
        .limit(1)
      if (existing && existing.length > 0) continue

      const inf = await findCaseForNotification(notif, workspaceId)
      if (!inf.case_id) {
        results.push({ entity_type: 'notification', entity_id: notif.id, case_id: null, method: inf.method, confidence: 0, action: 'no_match' })
        continue
      }

      if (!dryRun) {
        try {
          await linkNotificationToCase(notif.id, inf.case_id, inf.method, inf.confidence)
        } catch (e) {
          errors.push(`notification ${notif.id}: ${e instanceof Error ? e.message : 'unknown'}`)
          continue
        }
      }
      results.push({
        entity_type: 'notification',
        entity_id:   notif.id,
        case_id:     inf.case_id,
        method:      inf.method,
        confidence:  inf.confidence,
        action:      'linked',
      })
    }
  } catch (e) {
    errors.push(`notifications scan: ${e instanceof Error ? e.message : 'unknown'}`)
  }

  const linked    = results.filter(r => r.action === 'linked').length
  const created   = results.filter(r => r.action === 'created_case').length
  const noMatch   = results.filter(r => r.action === 'no_match').length
  const skipped   = results.filter(r => r.action === 'skipped').length

  if (!dryRun) {
    await logAction({
      action_type: 'case_backfill_links',
      entity_type: 'operational_case',
      entity_id:   'backfill',
      summary:     `Backfill complete: ${linked} linked, ${created} cases created, ${noMatch} unmatched, ${skipped} skipped`,
      output:      { dry_run: false, linked, created, no_match: noMatch, skipped, errors },
      status:      errors.length > 0 ? 'failed' : 'completed',
    })
  }

  return NextResponse.json({
    dry_run:  dryRun,
    summary:  { linked, created, no_match: noMatch, skipped, errors: errors.length },
    results,
    errors,
  })
}
