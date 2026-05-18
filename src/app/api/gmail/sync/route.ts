import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'
import { fetchRecentEmails, getActiveAccount } from '@/lib/gmail-client'

export const dynamic = 'force-dynamic'

// GET — list emails from DB
export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const urgency = searchParams.get('urgency')
  const requires_action = searchParams.get('requires_action')
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)

  let query = db
    .from('emails')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(limit)

  if (category) query = query.eq('category', category)
  if (urgency) query = query.eq('urgency', urgency)
  if (requires_action === 'true') query = query.eq('requires_action', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — sync from Gmail API into DB
export async function POST() {
  try {
    const account = await getActiveAccount()
    console.log('[gmail/sync] account lookup result | found:', !!account, '| id:', account?.id ?? 'none')
    if (!account) {
      return NextResponse.json({
        error: 'No connected Gmail account. Connect Gmail first.',
        debug: { query: "email_accounts WHERE status='connected' ORDER BY created_at DESC LIMIT 1" },
      }, { status: 400 })
    }

    const emails = await fetchRecentEmails(50)
    const db = getAdmin()

    let newCount = 0
    const errors: string[] = []

    for (const email of emails) {
      const { error } = await db.from('emails').upsert({
        account_id: account.id as string,
        gmail_id: email.gmail_id,
        thread_id: email.thread_id,
        subject: email.subject,
        sender_email: email.sender_email,
        sender_name: email.sender_name,
        recipient_emails: email.recipient_emails,
        snippet: email.snippet,
        body_text: email.body_text,
        received_at: email.received_at,
        is_read: false,
      }, { onConflict: 'gmail_id', ignoreDuplicates: true })

      if (error) {
        errors.push(error.message)
      } else {
        newCount++
      }
    }

    // Update last_synced_at
    await db.from('email_accounts').update({
      last_synced_at: new Date().toISOString(),
    }).eq('id', account.id as string)

    await emitFeedEvent(db, {
      event_type: 'gmail_synced',
      title: `Gmail synced — ${newCount} emails`,
      description: `Fetched ${emails.length} from inbox, ${newCount} saved`,
      severity: 'info',
      metadata: { total_fetched: emails.length, saved: newCount },
    })

    await logAction({
      action_type: 'gmail.sync',
      summary: `Synced ${newCount} emails from Gmail`,
      status: 'completed',
    })

    return NextResponse.json({ synced: newCount, total_fetched: emails.length, errors })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    console.error('[gmail/sync]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
