import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'
import { auditAction } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db     = getAdmin()

  const { data: suggestion, error: fetchErr } = await db
    .from('inbox_workflow_suggestions')
    .select('id, email_id, suggestion_type, title, status')
    .eq('id', id)
    .single()

  if (fetchErr || !suggestion) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Not found' }, { status: 404 })
  }

  if (suggestion.status !== 'suggested') {
    return NextResponse.json({ error: `Already ${suggestion.status}` }, { status: 409 })
  }

  const { error: updateErr } = await db
    .from('inbox_workflow_suggestions')
    .update({ status: 'rejected' })
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  await emitFeedEvent(db, {
    event_type:   'workflow_suggestion_rejected',
    title:        `Rejected: ${suggestion.title}`,
    severity:     'info',
    source_table: 'inbox_workflow_suggestions',
    source_id:    suggestion.id,
    metadata:     {
      suggestion_id:   suggestion.id,
      suggestion_type: suggestion.suggestion_type,
      email_id:        suggestion.email_id,
    },
  })

  await auditAction(
    'inbox_workflow_suggestion.rejected',
    'inbox_workflow_suggestion',
    id,
    { suggestion_type: suggestion.suggestion_type },
  )

  return NextResponse.json({ ok: true, status: 'rejected' })
}
