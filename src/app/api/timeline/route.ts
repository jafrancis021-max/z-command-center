import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const db = getAdmin()
    const { data, error } = await db
      .from('project_timeline_events')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return NextResponse.json({ events: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      project_id: string
      event_type: string
      title: string
      description?: string
      metadata?: Record<string, unknown>
    }
    if (!body.project_id || !body.event_type || !body.title) {
      return NextResponse.json({ error: 'project_id, event_type, title required' }, { status: 400 })
    }
    const db = getAdmin()
    const { data, error } = await db
      .from('project_timeline_events')
      .insert({
        project_id: body.project_id,
        event_type: body.event_type,
        title: body.title,
        description: body.description ?? null,
        metadata: body.metadata ?? {},
      })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ event: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
