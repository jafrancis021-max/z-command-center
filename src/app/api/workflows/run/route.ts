import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { executeWorkflow } from '@/lib/workflow-executor'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { createOperationalEvent } from '@/lib/operational-events'
import { recordWorkflowLearningSignal } from '@/lib/workflow-learning'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const db = getAdmin()
  const body = await req.json()
  const { template_id, project_id, input = {} } = body
  const workspaceId = await getCurrentWorkspaceId()

  if (!template_id) {
    return NextResponse.json({ error: 'template_id required' }, { status: 400 })
  }

  // Verify template exists and is enabled
  const { data: template, error: tErr } = await db
    .from('workflow_templates')
    .select('*')
    .eq('id', template_id)
    .eq('enabled', true)
    .single()

  if (tErr || !template) {
    return NextResponse.json({ error: 'Template not found or disabled' }, { status: 404 })
  }

  // Create the run record
  const { data: run, error: rErr } = await db
    .from('workflow_runs')
    .insert({
      workflow_template_id: template_id,
      project_id: project_id ?? null,
      status: 'queued',
      input,
    })
    .select()
    .single()

  if (rErr || !run) {
    return NextResponse.json({ error: rErr?.message ?? 'Failed to create run' }, { status: 500 })
  }

  // Execute synchronously
  const result = await executeWorkflow(run.id)

  await logAction({
    action_type: `workflow.${template.name}`,
    entity_type: 'workflow_run',
    entity_id: run.id,
    project_id: project_id ?? null,
    summary: `Ran workflow "${template.name}" — ${result.success ? 'completed' : 'failed'}`,
    status: result.success ? 'completed' : 'failed',
  })

  after(() => createOperationalEvent({
    workspace_id:     workspaceId,
    event_type:       'workflow.started',
    event_source:     'workflow_engine',
    entity_type:      'workflow_run',
    entity_id:        run.id,
    title:            `Workflow started: "${template.name}"`,
    description:      result.success ? 'Completed successfully.' : `Failed: ${String(result.output?.error ?? 'unknown error')}`,
    metadata:         { template_id, template_name: template.name, success: result.success, project_id: project_id ?? null },
    importance_score: 0.6,
    memory_mode:      'procedural',
    temperature_tier: 'hot',
  }))

  // Wire workflow learning signals
  if (workspaceId) {
    after(() => recordWorkflowLearningSignal({
      workspaceId,
      workflowId:     run.id,
      signalType:     result.success ? 'workflow_completed' : 'workflow_failed',
      signalSource:   'system',
      signalStrength: 1.0,
      metadata:       { template_id, template_name: template.name },
    }))

    if (result.success) {
      after(async () => {
        const { count } = await db
          .from('workflow_runs')
          .select('id', { count: 'exact', head: true })
          .eq('workflow_template_id', template_id)
          .neq('id', run.id)
          .eq('status', 'completed')
        if ((count ?? 0) > 0) {
          await recordWorkflowLearningSignal({
            workspaceId:    workspaceId as string,
            workflowId:     run.id,
            signalType:     'workflow_repeated',
            signalSource:   'system',
            signalStrength: 1.0,
            metadata:       { template_id, prior_run_count: count },
          })
        }
      })
    }
  }

  // Return updated run
  const { data: updatedRun } = await db
    .from('workflow_runs')
    .select('*, template:workflow_templates(*), steps:workflow_run_steps(*)')
    .eq('id', run.id)
    .single()

  return NextResponse.json(updatedRun ?? run)
}
