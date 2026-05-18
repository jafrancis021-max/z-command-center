import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('project_id')
    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const db = getAdmin()
    const { data, error } = await db
      .from('claude_sessions')
      .select('*, results:session_results(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ sessions: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      project_id: string
      prompt: string
      session_type?: string
      status?: string
    }
    if (!body.project_id || !body.prompt) {
      return NextResponse.json({ error: 'project_id and prompt required' }, { status: 400 })
    }
    const db = getAdmin()
    const { data, error } = await db
      .from('claude_sessions')
      .insert({
        project_id: body.project_id,
        prompt: body.prompt,
        session_type: body.session_type ?? 'build',
        status: body.status ?? 'pending',
      })
      .select()
      .single()
    if (error) throw error

    // Auto-add timeline event
    await db.from('project_timeline_events').insert({
      project_id: body.project_id,
      event_type: 'prompt_generated',
      title: `Claude session started: ${body.session_type ?? 'build'}`,
      description: body.prompt.slice(0, 200),
      metadata: { session_id: data.id, session_type: body.session_type },
    })

    await logAction({
      action_type: 'session_created',
      entity_type: 'claude_session',
      entity_id: data.id,
      project_id: body.project_id,
      summary: `Created ${body.session_type ?? 'build'} session`,
      status: 'completed',
    })

    return NextResponse.json({ session: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id: string; status: string }
    if (!body.id || !body.status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 })
    }
    const db = getAdmin()
    const { data, error } = await db
      .from('claude_sessions')
      .update({ status: body.status })
      .eq('id', body.id)
      .select('*, results:session_results(*)')
      .single()
    if (error) throw error
    return NextResponse.json({ session: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
