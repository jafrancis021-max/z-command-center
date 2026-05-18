import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const project_id = searchParams.get('project_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '20', 10)

  let query = db
    .from('workflow_runs')
    .select('*, template:workflow_templates(id, name, category, description)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (project_id) query = query.eq('project_id', project_id)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
