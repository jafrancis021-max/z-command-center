import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('project_id')
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

  const { data, error } = await getAdmin()
    .from('blockers')
    .select('*')
    .eq('project_id', projectId)
    .neq('status', 'resolved')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ blockers: data ?? [] })
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    const { project_id, title, description, severity } = await req.json()
    if (!project_id || !title) {
      return NextResponse.json({ error: 'project_id and title required' }, { status: 400 })
    }

    const { data, error } = await getAdmin()
      .from('blockers')
      .insert({ project_id, title, description: description || null, severity: severity || 'medium' })
      .select()
      .single()

    if (error) throw error

    await logAction({
      action_type: 'blocker_added',
      entity_type: 'blocker',
      entity_id: data.id,
      project_id,
      summary: `Blocker added: ${title}`,
      status: 'completed',
      duration_ms: Date.now() - start,
    })

    return NextResponse.json({ blocker: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const start = Date.now()
  try {
    const { id, status, severity, description } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (status) updates.status = status
    if (severity) updates.severity = severity
    if (description !== undefined) updates.description = description
    if (status === 'resolved') updates.resolved_at = new Date().toISOString()

    const { data, error } = await getAdmin()
      .from('blockers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAction({
      action_type: 'blocker_updated',
      entity_type: 'blocker',
      entity_id: id,
      project_id: data.project_id,
      summary: `Blocker ${status === 'resolved' ? 'resolved' : 'updated'}: ${data.title}`,
      status: 'completed',
      duration_ms: Date.now() - start,
    })

    return NextResponse.json({ blocker: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
