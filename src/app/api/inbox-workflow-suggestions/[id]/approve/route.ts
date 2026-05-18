import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'
import { startWorkflowChain } from '@/lib/workflow-chain-engine'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db     = getAdmin()

  // Load the suggestion
  const { data: suggestion, error: fetchErr } = await db
    .from('inbox_workflow_suggestions')
    .select('id, email_id, project_id, suggestion_type, title, description, suggested_actions, status')
    .eq('id', id)
    .single()

  if (fetchErr || !suggestion) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Not found' }, { status: 404 })
  }

  if (suggestion.status !== 'suggested') {
    return NextResponse.json({ error: `Already ${suggestion.status}` }, { status: 409 })
  }

  // Update status → approved
  const { error: updateErr } = await db
    .from('inbox_workflow_suggestions')
    .update({ status: 'approved' })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const executedActions: string[] = []

  // Safe auto-execution: create an approval record for approval_needed
  if (suggestion.suggestion_type === 'approval_needed') {
    const { error: approvalErr } = await db.from('approvals').insert({
      approval_type: 'inbox_workflow',
      title:         suggestion.title,
      description:   suggestion.description ?? null,
      payload:       {
        email_id:          suggestion.email_id,
        suggestion_id:     suggestion.id,
        suggestion_type:   suggestion.suggestion_type,
        suggested_actions: suggestion.suggested_actions,
      },
      project_id:    suggestion.project_id ?? null,
      entity_type:   'inbox_workflow_suggestion',
      entity_id:     suggestion.id,
      status:        'pending',
    })

    if (!approvalErr) executedActions.push('approval_record_created')
  }

  // Always emit a feed event
  await emitFeedEvent(db, {
    event_type:   'workflow_suggestion_approved',
    title:        `Approved: ${suggestion.title}`,
    description:  `Suggestion type: ${suggestion.suggestion_type.replace(/_/g, ' ')}`,
    severity:     suggestion.suggestion_type === 'blocker_detected' ? 'warning' : 'success',
    source_table: 'inbox_workflow_suggestions',
    source_id:    suggestion.id,
    metadata:     {
      suggestion_id:   suggestion.id,
      suggestion_type: suggestion.suggestion_type,
      email_id:        suggestion.email_id,
      executed:        executedActions,
    },
  })

  // Start workflow chain for this suggestion type (non-blocking — failure must not break approve)
  try {
    const runId = await startWorkflowChain(db, {
      source_type:  'inbox_workflow_suggestion',
      source_id:    suggestion.id,
      trigger_type: suggestion.suggestion_type,
    })
    if (runId) executedActions.push('workflow_chain_started')
  } catch {
    // Chain start is non-critical
  }

  return NextResponse.json({
    ok:               true,
    status:           'approved',
    executed_actions: executedActions,
  })
}
