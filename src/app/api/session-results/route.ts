import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      session_id: string
      summary?: string
      outcome?: string
      files_changed?: string[]
      success: boolean
      rollback_notes?: string
    }
    if (!body.session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    }
    const db = getAdmin()

    // Insert result
    const { data: result, error } = await db
      .from('session_results')
      .insert({
        session_id: body.session_id,
        summary: body.summary ?? null,
        outcome: body.outcome ?? null,
        files_changed: body.files_changed ?? null,
        success: body.success,
        rollback_notes: body.rollback_notes ?? null,
      })
      .select()
      .single()
    if (error) throw error

    // Update session status to match result
    const newStatus = body.success ? 'success' : 'failed'
    const { data: session } = await db
      .from('claude_sessions')
      .update({ status: newStatus })
      .eq('id', body.session_id)
      .select('project_id, session_type')
      .single()

    // Add timeline event
    if (session?.project_id) {
      await db.from('project_timeline_events').insert({
        project_id: session.project_id,
        event_type: body.success ? 'claude_success' : 'claude_failure',
        title: body.success ? 'Claude session succeeded' : 'Claude session failed',
        description: body.summary?.slice(0, 300) ?? null,
        metadata: {
          session_id: body.session_id,
          session_type: session.session_type,
          files_changed: body.files_changed ?? [],
          rollback_notes: body.rollback_notes ?? null,
        },
      })
    }

    await logAction({
      action_type: body.success ? 'session_success' : 'session_failure',
      entity_type: 'session_result',
      entity_id: result.id,
      project_id: session?.project_id ?? null,
      summary: body.summary?.slice(0, 200) ?? (body.success ? 'Session succeeded' : 'Session failed'),
      status: 'completed',
    })

    return NextResponse.json({ result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
