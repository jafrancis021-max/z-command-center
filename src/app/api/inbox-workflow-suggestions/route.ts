import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const db     = getAdmin()
  const status = req.nextUrl.searchParams.get('status') ?? 'suggested'
  const limit  = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)

  const { data, error } = await db
    .from('inbox_workflow_suggestions')
    .select(`
      id, email_id, project_id, suggestion_type, title, description,
      confidence, status, suggested_actions, source, created_at, updated_at,
      emails ( subject, sender_email )
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten the joined email fields for the client
  const suggestions = (data ?? []).map((row: Record<string, unknown>) => {
    const emailJoin = row.emails as { subject: string | null; sender_email: string | null } | null
    return {
      ...row,
      emails:       undefined,
      email_subject: emailJoin?.subject    ?? null,
      email_sender:  emailJoin?.sender_email ?? null,
    }
  })

  return NextResponse.json(suggestions)
}
