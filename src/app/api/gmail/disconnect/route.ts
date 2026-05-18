import { NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'

export const dynamic = 'force-dynamic'

export async function POST() {
  const db = getAdmin()

  const { data: account, error: fetchErr } = await db
    .from('email_accounts')
    .select('id, email_address')
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (fetchErr || !account) {
    console.log('[gmail/disconnect] no connected account to disconnect')
    return NextResponse.json({ disconnected: false, reason: 'no_connected_account' })
  }

  const { error: updateErr } = await db
    .from('email_accounts')
    .update({ status: 'disconnected' })
    .eq('id', account.id as string)

  if (updateErr) {
    console.error('[gmail/disconnect] update failed:', updateErr.message)
    return NextResponse.json({ disconnected: false, error: updateErr.message }, { status: 500 })
  }

  console.log('[gmail/disconnect] account disconnected:', account.email_address)

  await emitFeedEvent(db, {
    event_type: 'gmail_disconnected',
    title: `Gmail disconnected: ${account.email_address}`,
    severity: 'warning',
    metadata: { email: account.email_address },
  })

  await logAction({
    action_type: 'gmail.disconnect',
    summary:     `Gmail account disconnected: ${account.email_address}`,
    status:      'completed',
  })

  return NextResponse.json({ disconnected: true, email: account.email_address })
}
