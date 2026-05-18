import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const db     = getAdmin()
  const url    = new URL(req.url)
  const type   = url.searchParams.get('memory_type')
  const proj   = url.searchParams.get('project_id')
  const status = url.searchParams.get('status') ?? 'active'
  const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)

  let query = db
    .from('operational_memories')
    .select('*')
    .eq('status', status)
    .order('last_seen_at', { ascending: false })
    .limit(limit)

  if (type)  query = query.eq('memory_type', type)
  if (proj)  query = query.eq('project_id', proj)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
