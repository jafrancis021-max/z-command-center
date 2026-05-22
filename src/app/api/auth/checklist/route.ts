import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const uid = req.cookies.get('z_uid')?.value
  if (!uid) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { progress } = await req.json() as { progress?: Record<string, boolean> }
  if (!progress) return NextResponse.json({ error: 'progress required' }, { status: 400 })

  const db = getAdmin()
  const { error } = await db
    .from('profiles')
    .update({ checklist_progress: progress, updated_at: new Date().toISOString() })
    .eq('auth_id', uid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
