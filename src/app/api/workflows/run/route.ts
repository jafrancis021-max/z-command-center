import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { executeWorkflow } from '@/lib/workflow-executor'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const db = getAdmin()
  const body = await req.json()
  const { template_id, project_id, input = {} } = body

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

  // Return updated run
  const { data: updatedRun } = await db
    .from('workflow_runs')
    .select('*, template:workflow_templates(*), steps:workflow_run_steps(*)')
    .eq('id', run.id)
    .single()

  return NextResponse.json(updatedRun ?? run)
}
