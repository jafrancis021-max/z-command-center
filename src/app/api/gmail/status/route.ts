import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getAdmin()

  let data: Record<string, unknown> | null = null
  let queryError: string | null = null

  try {
    const result = await db
      .from('email_accounts')
      .select('id, email_address, provider, status, last_synced_at, created_at, scopes')
      .eq('status', 'connected')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (result.error) {
      // PGRST116 = no rows found — not a real error, just no account connected
      if (result.error.code === 'PGRST116') {
        console.log('[gmail/status] no connected account found in DB')
      } else {
        queryError = result.error.message
        console.error('[gmail/status] DB query error:', result.error.code, result.error.message)
      }
    }
    data = result.data as Record<string, unknown> | null
  } catch (err) {
    queryError = err instanceof Error ? err.message : String(err)
    console.error('[gmail/status] unexpected error:', queryError)
  }

  console.log('[gmail/status] account found:', !!data, '| status:', data?.status ?? 'n/a', '| queryError:', queryError ?? 'none')

  // Surface DB errors so the client can distinguish "disconnected" from "server error"
  if (queryError) {
    return NextResponse.json(
      { connected: false, error: 'db_error', detail: queryError },
      { status: 500 },
    )
  }

  if (!data) {
    console.log('[gmail/status] returning connected: false (no account)')
    return NextResponse.json({ connected: false })
  }

  // Count synced emails
  const { count } = await db
    .from('emails')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', data.id as string)

  console.log('[gmail/status] returning connected: true | email:', data.email_address, '| email_count:', count ?? 0)

  return NextResponse.json({
    connected: true,
    email: data.email_address,
    provider: data.provider,
    account: {
      id:            data.id,
      email_address: data.email_address,
      provider:      data.provider,
      status:        data.status,
      last_synced_at: data.last_synced_at,
      connected_at:  data.created_at,
    },
    email_count: count ?? 0,
  })
}
