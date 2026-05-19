import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { auditAction } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const db = getAdmin()
  const { error } = await db
    .from('notifications')
    .update({ read: true })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditAction('notification.read', 'notification', params.id)

  return NextResponse.json({ ok: true })
}
