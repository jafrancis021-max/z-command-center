import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { executeNextChainStep } from '@/lib/workflow-chain-engine'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db     = getAdmin()

  const { data: run, error: fetchErr } = await db
    .from('workflow_chain_runs')
    .select('id, status, current_step, workflow_chain_id')
    .eq('id', id)
    .single()

  if (fetchErr || !run) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Not found' }, { status: 404 })
  }

  const r = run as { id: string; status: string; current_step: number; workflow_chain_id: string }

  if (r.status !== 'waiting_approval') {
    return NextResponse.json(
      { error: `Cannot continue a run with status: ${r.status}` },
      { status: 409 },
    )
  }

  // Advance past the current step and resume execution
  const { error: updateErr } = await db
    .from('workflow_chain_runs')
    .update({ status: 'pending', current_step: r.current_step + 1 })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await executeNextChainStep(db, id)

  const { data: updated } = await db
    .from('workflow_chain_runs')
    .select('status, current_step')
    .eq('id', id)
    .single()

  return NextResponse.json({
    ok:           true,
    status:       (updated as { status: string; current_step: number } | null)?.status,
    current_step: (updated as { status: string; current_step: number } | null)?.current_step,
  })
}
