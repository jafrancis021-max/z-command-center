import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const { data: run, error: runErr } = await getAdmin()
    .from('browser_execution_runs')
    .select('*')
    .eq('id', id)
    .single()

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 404 })

  const { data: steps } = await getAdmin()
    .from('browser_execution_steps')
    .select('*')
    .eq('run_id', id)
    .order('step_order', { ascending: true })

  return NextResponse.json({ run: { ...run, steps: steps ?? [] } })
}
