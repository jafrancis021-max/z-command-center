import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100)
  const status = searchParams.get('status')

  let query = db
    .from('workflow_chain_runs')
    .select(`
      id,
      workflow_chain_id,
      source_type,
      source_id,
      status,
      current_step,
      result,
      error_message,
      created_at,
      updated_at,
      workflow_chains ( name, trigger_type )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
