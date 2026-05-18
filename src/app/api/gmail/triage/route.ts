import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { emitFeedEvent } from '@/lib/feed'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// GET — list triage results with email info
export async function GET(req: NextRequest) {
  const db = getAdmin()
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '30', 10)

  const { data, error } = await db
    .from('email_triage_results')
    .select('*, email:emails(id, subject, sender_email, snippet, received_at, urgency, category, requires_action, linked_project_id)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — triage untriaged emails using Claude
export async function POST() {
  const db = getAdmin()

  // Find emails that have no triage result yet
  const { data: untriagedEmails } = await db
    .from('emails')
    .select('id, subject, sender_email, sender_name, snippet, body_text, received_at')
    .eq('category', 'uncategorized')
    .order('received_at', { ascending: false })
    .limit(20)

  if (!untriagedEmails?.length) {
    return NextResponse.json({ message: 'No untriaged emails', triaged: 0 })
  }

  // Fetch projects for linkage
  const { data: projects } = await db
    .from('projects')
    .select('id, name')
    .neq('status', 'archived')

  const projectList = (projects ?? []).map(p => `${p.name} (id: ${p.id})`).join('\n')

  let triaged = 0
  let urgentCount = 0
  let taskApprovalCount = 0
  let draftApprovalCount = 0

  for (const email of untriagedEmails) {
    try {
      const prompt = `You are an email triage assistant for an AI operations system. Classify this email and extract actionable information.

EMAIL:
From: ${email.sender_email}
Subject: ${email.subject ?? '(no subject)'}
Snippet: ${email.snippet ?? ''}
Body (first 1500 chars):
${(email.body_text ?? '').slice(0, 1500)}

KNOWN PROJECTS:
${projectList || 'No projects configured yet.'}

Respond with ONLY valid JSON matching this schema exactly:
{
  "classification": "urgent|project_related|admin|finance|opportunity|ignore",
  "urgency": "critical|high|medium|low",
  "linked_project_id": "<uuid from the project list above, or null>",
  "requires_action": true|false,
  "extracted_tasks": [
    { "title": "string", "priority": "high|medium|low", "deadline": "string or null" }
  ],
  "suggested_reply": "string or null",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence"
}`

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) continue

      const result = JSON.parse(match[0]) as {
        classification: string
        urgency: string
        linked_project_id: string | null
        requires_action: boolean
        extracted_tasks: Array<{ title: string; priority: string; deadline: string | null }>
        suggested_reply: string | null
        confidence: number
        reasoning: string
      }

      // Save triage result
      const { data: triageRow } = await db.from('email_triage_results').insert({
        email_id: email.id,
        classification: result.classification,
        urgency: result.urgency,
        project_id: result.linked_project_id,
        extracted_tasks: result.extracted_tasks,
        summary: result.reasoning,
        suggested_reply: result.suggested_reply,
        priority_score: result.urgency === 'critical' ? 100 : result.urgency === 'high' ? 75 : result.urgency === 'medium' ? 50 : 25,
        confidence: result.confidence,
        reasoning: result.reasoning,
      }).select().single()

      // Update email record
      await db.from('emails').update({
        category: result.classification,
        urgency: result.urgency,
        linked_project_id: result.linked_project_id,
        requires_action: result.requires_action,
      }).eq('id', email.id)

      triaged++

      // Feed event for urgent/critical
      if (result.urgency === 'critical' || result.urgency === 'high') {
        urgentCount++
        await emitFeedEvent(db, {
          event_type: 'email_urgent',
          title: `Urgent email: ${email.subject ?? '(no subject)'}`,
          description: `From ${email.sender_email} — ${result.reasoning}`,
          severity: result.urgency === 'critical' ? 'critical' : 'warning',
          source_table: 'emails',
          source_id: email.id,
          metadata: { classification: result.classification, urgency: result.urgency },
        })
      }

      // Create approval for extracted tasks
      if (result.extracted_tasks?.length && result.requires_action) {
        taskApprovalCount++
        await db.from('approvals').insert({
          approval_type: 'email.task_extraction',
          title: `Approve extracted tasks from email: "${email.subject ?? 'no subject'}"`,
          description: `${result.extracted_tasks.length} task(s) extracted from email by ${email.sender_email}`,
          payload: {
            email_id: email.id,
            email_subject: email.subject,
            sender: email.sender_email,
            tasks: result.extracted_tasks,
            triage_id: triageRow?.id,
          },
          project_id: result.linked_project_id,
          entity_type: 'email',
          entity_id: email.id,
          status: 'pending',
        })

        await emitFeedEvent(db, {
          event_type: 'email_tasks_pending_approval',
          title: `Task extraction pending approval`,
          description: `${result.extracted_tasks.length} tasks from: "${email.subject}"`,
          severity: 'warning',
          source_table: 'emails',
          source_id: email.id,
        })
      }

      // Create approval for suggested reply
      if (result.suggested_reply && result.requires_action) {
        draftApprovalCount++
        const { data: draft } = await db.from('email_drafts').insert({
          email_id: email.id,
          to_address: email.sender_email,
          subject: `Re: ${email.subject ?? ''}`,
          body: result.suggested_reply,
          context_note: result.reasoning,
          status: 'pending',
          linked_project_id: result.linked_project_id,
        }).select().single()

        await db.from('approvals').insert({
          approval_type: 'email.draft_reply',
          title: `Approve draft reply to: "${email.subject ?? 'no subject'}"`,
          description: `AI-generated reply to ${email.sender_email}`,
          payload: {
            email_id: email.id,
            email_subject: email.subject,
            sender: email.sender_email,
            draft_id: draft?.id,
            draft_preview: (result.suggested_reply ?? '').slice(0, 300),
          },
          project_id: result.linked_project_id,
          entity_type: 'email_draft',
          entity_id: draft?.id,
          status: 'pending',
        })

        await emitFeedEvent(db, {
          event_type: 'email_draft_pending_approval',
          title: `Draft reply pending approval`,
          description: `Reply to: "${email.subject}"`,
          severity: 'info',
          source_table: 'email_drafts',
          source_id: draft?.id,
        })
      }
    } catch (err) {
      console.error(`[gmail/triage] Failed email ${email.id}:`, err)
    }
  }

  await emitFeedEvent(db, {
    event_type: 'email_triage_completed',
    title: `Email triage completed — ${triaged} emails processed`,
    description: `${urgentCount} urgent, ${taskApprovalCount} task extractions, ${draftApprovalCount} draft replies`,
    severity: 'success',
    metadata: { triaged, urgent: urgentCount, task_approvals: taskApprovalCount, draft_approvals: draftApprovalCount },
  })

  await logAction({
    action_type: 'gmail.triage',
    summary: `Triaged ${triaged} emails — ${urgentCount} urgent`,
    status: 'completed',
  })

  return NextResponse.json({ triaged, urgent: urgentCount, task_approvals: taskApprovalCount, draft_approvals: draftApprovalCount })
}
