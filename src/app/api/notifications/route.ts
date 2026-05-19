import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const db          = getAdmin()
  const url         = new URL(req.url)
  const unread      = url.searchParams.get('unread') === 'true'
  const severity    = url.searchParams.get('severity')
  const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)
  const workspaceId = await getCurrentWorkspaceId()

  let query = db
    .from('notifications')
    .select('*')
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (workspaceId) query = query.eq('workspace_id', workspaceId)
  if (unread)      query = query.eq('read', false)
  if (severity)    query = query.eq('severity', severity)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
