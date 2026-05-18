import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50')

  const { data, error } = await getAdmin()
    .from('approvals')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ approvals: data ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const { approval_type, title, description, payload, project_id, entity_type, entity_id } =
      await req.json()

    if (!approval_type || !title) {
      return NextResponse.json({ error: 'approval_type and title required' }, { status: 400 })
    }

    const { data, error } = await getAdmin()
      .from('approvals')
      .insert({
        approval_type,
        title,
        description: description || null,
        payload: payload ?? {},
        project_id: project_id || null,
        entity_type: entity_type || null,
        entity_id: entity_id || null,
      })
      .select()
      .single()

    if (error) throw error

    await logAction({
      action_type: 'approval_created',
      entity_type: 'approval',
      entity_id: data.id,
      project_id: project_id ?? null,
      summary: `Approval created: ${title}`,
      status: 'completed',
    })

    return NextResponse.json({ approval: data })
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
    const { id, action, rejection_note } = await req.json()

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action required' }, { status: 400 })
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      status: action === 'approve' ? 'approved' : 'rejected',
    }
    if (action === 'approve') updates.approved_at = new Date().toISOString()
    if (action === 'reject' && rejection_note) updates.rejection_note = rejection_note

    const { data, error } = await getAdmin()
      .from('approvals')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    await logAction({
      action_type: `approval_${action === 'approve' ? 'approved' : 'rejected'}`,
      entity_type: 'approval',
      entity_id: id,
      project_id: data.project_id ?? null,
      summary: `${action === 'approve' ? 'Approved' : 'Rejected'}: ${data.title}`,
      status: 'completed',
      duration_ms: Date.now() - start,
    })

    return NextResponse.json({ approval: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
