import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const project_id = searchParams.get('project_id')
  const severity = searchParams.get('severity')
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)

  let query = db
    .from('operational_feed_events')
    .select('*, project:projects(name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (project_id) query = query.eq('project_id', project_id)
  if (severity) query = query.eq('severity', severity)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    project_name: (row.project as { name?: string } | null)?.name ?? null,
    project: undefined,
  }))

  return NextResponse.json(events)
}
