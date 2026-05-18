import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { buildOAuthClient } from '@/lib/gmail-client'
import { encrypt } from '@/lib/crypto-utils'
import { getAdmin } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'
import { logAction } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  console.log('[gmail/callback] received code:', code ? 'present' : 'missing', '| error:', error ?? 'none')

  if (error || !code) {
    return NextResponse.redirect(new URL('/inbox?error=oauth_denied', req.url))
  }

  try {
    const oAuth2Client = buildOAuthClient()
    const { tokens } = await oAuth2Client.getToken(code)
    oAuth2Client.setCredentials(tokens)
    console.log('[gmail/callback] token exchange success | has_access_token:', !!tokens.access_token, '| has_refresh_token:', !!tokens.refresh_token)

    // Fetch authenticated user's email
    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const userEmail = profile.data.emailAddress ?? 'unknown@gmail.com'
    console.log('[gmail/callback] user email fetched:', userEmail)

    const db = getAdmin()

    // Check if we already have a refresh_token stored for this account.
    // Google only returns a new refresh_token if prompt='consent' OR on first auth.
    // To avoid overwriting a good refresh_token with null (breaking future refreshes),
    // we only update refresh_token when Google actually returns one.
    const { data: existing } = await db
      .from('email_accounts')
      .select('id, refresh_token')
      .eq('email_address', userEmail)
      .single()

    const newRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null
    const preservedRefreshToken: string | null = newRefreshToken ?? ((existing?.refresh_token as string | null) ?? null)
    console.log('[gmail/callback] refresh_token | new_from_google:', !!tokens.refresh_token, '| preserved_existing:', !newRefreshToken && !!existing?.refresh_token)

    const payload = {
      email_address:  userEmail,
      provider:       'gmail',
      access_token:   encrypt(tokens.access_token ?? ''),
      refresh_token:  preservedRefreshToken,
      token_expiry:   tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      scopes:         tokens.scope ? tokens.scope.split(' ') : [],
      // 'active' is not a valid status — schema CHECK is: connected | disconnected | error
      status: 'connected' as const,
    }
    console.log('[gmail/callback] upsert payload:', {
      ...payload,
      access_token:  '[encrypted]',
      refresh_token: payload.refresh_token ? '[encrypted]' : null,
    })

    // Upsert email_account — server-side only, tokens never leave the server
    const { error: upsertError } = await db
      .from('email_accounts')
      .upsert(payload, { onConflict: 'email_address' })

    if (upsertError) {
      console.error('[gmail/callback] Supabase upsert error:', upsertError.message, upsertError.code, upsertError.details)
      return NextResponse.redirect(new URL('/inbox?error=gmail_callback_failed', req.url))
    }

    console.log('[gmail/callback] upsert successful for:', userEmail)

    await emitFeedEvent(db, {
      event_type: 'gmail_connected',
      title: `Gmail connected: ${userEmail}`,
      severity: 'success',
      metadata: { email: userEmail },
    })

    await logAction({
      action_type: 'gmail.connect',
      summary: `Gmail account connected: ${userEmail}`,
      status: 'completed',
    })

    return NextResponse.redirect(new URL('/inbox?connected=1', req.url))
  } catch (err) {
    console.error('[gmail/callback] unhandled error:', err)
    return NextResponse.redirect(new URL('/inbox?error=gmail_callback_failed', req.url))
  }
}
