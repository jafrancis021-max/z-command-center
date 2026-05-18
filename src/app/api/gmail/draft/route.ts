import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// GET — list drafts with source email
export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '20', 10)
  const status = searchParams.get('status')

  let query = db
    .from('email_drafts')
    .select('*, email:emails(id, subject, sender_email, snippet, received_at)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — generate a draft reply for a specific email
export async function POST(req: NextRequest) {
  const db = getAdmin()
  const body = await req.json()
  const { email_id } = body as { email_id: string }

  if (!email_id) {
    return NextResponse.json({ error: 'email_id required' }, { status: 400 })
  }

  const { data: email, error: emailErr } = await db
    .from('emails')
    .select('*')
    .eq('id', email_id)
    .single()

  if (emailErr || !email) {
    return NextResponse.json({ error: 'Email not found' }, { status: 404 })
  }

  try {
    const prompt = `You are a professional email assistant. Write a concise, helpful reply to this email.

From: ${email.sender_email}${email.sender_name ? ` (${email.sender_name})` : ''}
Subject: ${email.subject ?? '(no subject)'}
Email body:
${(email.body_text ?? email.snippet ?? '').slice(0, 2000)}

Rules:
- Be professional and concise
- Do not make commitments or promises
- Do not reveal internal system details
- If the email is spam or irrelevant, still acknowledge receipt briefly
- Start with a greeting, end with a professional sign-off
- Keep it under 150 words

Reply:`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const draftText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    if (!draftText) {
      return NextResponse.json({ error: 'Claude returned empty draft' }, { status: 500 })
    }

    // Save draft — NOT sent
    const { data: draft } = await db.from('email_drafts').insert({
      email_id: email.id,
      to_address: email.sender_email,
      subject: `Re: ${email.subject ?? ''}`,
      body: draftText,
      context_note: 'AI-generated draft reply — requires approval before any use',
      status: 'pending',
      linked_project_id: email.linked_project_id ?? null,
    }).select().single()

    // Create approval
    await db.from('approvals').insert({
      approval_type: 'email.draft_reply',
      title: `Approve draft reply to: "${email.subject ?? 'no subject'}"`,
      description: `AI-generated reply to ${email.sender_email}`,
      payload: {
        email_id: email.id,
        email_subject: email.subject,
        sender: email.sender_email,
        draft_id: draft?.id,
        draft_preview: draftText.slice(0, 300),
      },
      project_id: email.linked_project_id ?? null,
      entity_type: 'email_draft',
      entity_id: draft?.id,
      status: 'pending',
    })

    await emitFeedEvent(db, {
      event_type: 'email_draft_pending_approval',
      title: `Draft reply generated`,
      description: `Reply to "${email.subject}" — pending approval`,
      severity: 'info',
      source_table: 'email_drafts',
      source_id: draft?.id,
    })

    await logAction({
      action_type: 'gmail.draft',
      entity_type: 'email_draft',
      entity_id: draft?.id,
      summary: `Draft reply generated for "${email.subject}"`,
      status: 'completed',
    })

    return NextResponse.json({ draft, requires_approval: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed'
    console.error('[gmail/draft]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
