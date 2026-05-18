import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getAdmin()

  const { data: run, error: fetchErr } = await db
    .from('workflow_runs')
    .select('id, status, project_id, workflow_template_id')
    .eq('id', id)
    .single()

  if (fetchErr || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!['queued', 'running', 'waiting_approval'].includes(run.status)) {
    return NextResponse.json({ error: `Cannot cancel a run in status "${run.status}"` }, { status: 400 })
  }

  const { error } = await db
    .from('workflow_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAction({
    action_type: 'workflow.cancel',
    entity_type: 'workflow_run',
    entity_id: id,
    project_id: run.project_id,
    summary: `Cancelled workflow run ${id}`,
    status: 'completed',
  })

  return NextResponse.json({ ok: true })
}
