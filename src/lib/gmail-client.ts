import { google } from 'googleapis'
import { decrypt, encrypt } from './crypto-utils'
import { getAdmin } from './supabase-server'

// ── OAuth client ──────────────────────────────────────────────────────────────

export function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(): string {
  const client = buildOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent',
  })
}

// ── Account helpers ───────────────────────────────────────────────────────────

export async function getActiveAccount() {
  const db = getAdmin()
  const { data, error } = await db
    .from('email_accounts')
    .select('*')
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  console.log('[gmail-client] getActiveAccount | found:', !!data, '| id:', data?.id ?? 'none', '| token_expiry:', data?.token_expiry ?? 'none', '| error:', error?.message ?? 'none')
  if (error || !data) return null
  return data as Record<string, unknown>
}

export async function getAuthenticatedClient() {
  const account = await getActiveAccount()
  if (!account) throw new Error('No connected Gmail account')

  // Decrypt stored tokens — fail fast if encryption key changed
  let accessToken: string
  let refreshToken: string | undefined
  try {
    accessToken  = decrypt(account.access_token as string)
    refreshToken = account.refresh_token ? decrypt(account.refresh_token as string) : undefined
  } catch (decryptErr) {
    console.error('[gmail-client] getAuthenticatedClient | decryption failed:', decryptErr instanceof Error ? decryptErr.message : String(decryptErr))
    throw new Error('encryption_key_changed_or_invalid')
  }

  const client = buildOAuthClient()
  client.setCredentials({
    access_token:  accessToken,
    refresh_token: refreshToken,
    expiry_date:   account.token_expiry ? new Date(account.token_expiry as string).getTime() : undefined,
  })

  // Proactively refresh if expired / close to expiry
  console.log('[gmail-client] getAuthenticatedClient | attempting token refresh check for account:', account.id)
  try {
    const tokenInfo = await client.getAccessToken()
    const newToken  = tokenInfo.token
    if (newToken && newToken !== accessToken) {
      console.log('[gmail-client] getAuthenticatedClient | token refreshed — updating DB')
      const db = getAdmin()
      // Retrieve the updated expiry from the client credentials
      const creds   = client.credentials
      const expiry  = creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null
      const updates: Record<string, string | null> = { access_token: encrypt(newToken) }
      if (expiry) updates.token_expiry = expiry
      await db
        .from('email_accounts')
        .update(updates)
        .eq('id', account.id as string)
      console.log('[gmail-client] getAuthenticatedClient | DB updated | new expiry:', expiry ?? 'unknown')
    } else {
      console.log('[gmail-client] getAuthenticatedClient | token still valid, no refresh needed')
    }
  } catch (refreshErr) {
    const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
    console.warn('[gmail-client] getAuthenticatedClient | token refresh failed:', msg, '— will attempt with stored credentials')
    if (!refreshToken) {
      throw new Error('refresh_token_missing_or_revoked')
    }
  }

  return { client, account }
}

// ── Email parsing ─────────────────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function extractBodyText(payload: Record<string, unknown>): string {
  if (!payload) return ''

  const body = payload.body as { data?: string } | undefined
  if (body?.data) return decodeBase64Url(body.data)

  const parts = payload.parts as Array<Record<string, unknown>> | undefined
  if (parts) {
    for (const part of parts) {
      if (part.mimeType === 'text/plain') {
        const pb = part.body as { data?: string } | undefined
        if (pb?.data) return decodeBase64Url(pb.data)
      }
    }
    // Recurse into first multipart child
    for (const part of parts) {
      if ((part.mimeType as string)?.startsWith('multipart/')) {
        const nested = extractBodyText(part)
        if (nested) return nested
      }
    }
    // Fallback: first part with data
    for (const part of parts) {
      const pb = part.body as { data?: string } | undefined
      if (pb?.data) return decodeBase64Url(pb.data)
    }
  }

  return ''
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export interface ParsedEmail {
  gmail_id: string
  thread_id: string
  subject: string
  sender_email: string
  sender_name: string
  recipient_emails: string[]
  snippet: string
  body_text: string
  received_at: string
}

// ── Fetch emails from Gmail API ───────────────────────────────────────────────

export async function fetchRecentEmails(maxResults = 50): Promise<ParsedEmail[]> {
  const { client } = await getAuthenticatedClient()
  const gmail = google.gmail({ version: 'v1', auth: client })

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults,
  })

  const messages = listRes.data.messages ?? []
  const results: ParsedEmail[] = []

  for (const msg of messages) {
    if (!msg.id) continue
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      })

      const payload = (detail.data.payload ?? {}) as Record<string, unknown>
      const headers = (payload.headers as Array<{ name: string; value: string }>) ?? []
      const internalDate = detail.data.internalDate

      const fromHeader = getHeader(headers, 'from')
      // Parse "Name <email>" format
      const nameMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/)
      const senderName = nameMatch ? nameMatch[1].trim().replace(/^"|"$/g, '') : ''
      const senderEmail = nameMatch ? nameMatch[2] : fromHeader

      results.push({
        gmail_id: msg.id,
        thread_id: detail.data.threadId ?? msg.threadId ?? '',
        subject: getHeader(headers, 'subject'),
        sender_email: senderEmail,
        sender_name: senderName,
        recipient_emails: getHeader(headers, 'to')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        snippet: detail.data.snippet ?? '',
        body_text: extractBodyText(payload).slice(0, 8000),
        received_at: internalDate
          ? new Date(parseInt(internalDate)).toISOString()
          : new Date().toISOString(),
      })
    } catch {
      // Skip individual message failures silently
    }
  }

  return results
}
