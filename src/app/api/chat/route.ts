import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getProjectContext } from '@/lib/supabase'
import { getAdmin } from '@/lib/supabase-server'
import type { ChatMessage, ProjectContext } from '@/types'

async function buildEmailContext(): Promise<string> {
  try {
    const db = getAdmin()
    const [urgentEmails, pendingEmailApprovals] = await Promise.all([
      db.from('emails')
        .select('subject, sender_email, urgency, requires_action, received_at')
        .in('urgency', ['critical', 'high'])
        .eq('requires_action', true)
        .order('received_at', { ascending: false })
        .limit(5),
      db.from('approvals')
        .select('title, approval_type, created_at')
        .eq('status', 'pending')
        .in('approval_type', ['email.task_extraction', 'email.draft_reply'])
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const lines: string[] = []
    if (urgentEmails.data?.length) {
      lines.push('\nURGENT EMAILS REQUIRING ATTENTION:')
      urgentEmails.data.forEach(e =>
        lines.push(`  [${e.urgency?.toUpperCase()}] "${e.subject}" from ${e.sender_email}`)
      )
    }
    if (pendingEmailApprovals.data?.length) {
      lines.push('\nPENDING EMAIL APPROVALS:')
      pendingEmailApprovals.data.forEach(a => lines.push(`  • ${a.title}`))
    }
    return lines.length ? lines.join('\n') + '\n\n' : ''
  } catch {
    return ''
  }
}

function buildSystemPrompt(ctx: ProjectContext, emailContext: string): string {
  const { project, tasks, decisions, notes, blockers, documents, memories } = ctx

  const taskSummary = tasks.length
    ? tasks
        .slice(0, 10)
        .map(t => `  [${t.status.toUpperCase()}][${t.priority}] ${t.title}${t.description ? ': ' + t.description : ''}`)
        .join('\n')
    : '  No tasks yet.'

  const decisionSummary = decisions.length
    ? decisions.slice(0, 6).map(d => `  • ${d.decision}`).join('\n')
    : '  No decisions yet.'

  const noteSummary = notes.length
    ? notes.slice(0, 5).map(n => `  • ${n.note}`).join('\n')
    : '  No notes yet.'

  const blockerSummary = blockers.filter(b => b.status !== 'resolved').length
    ? blockers
        .filter(b => b.status !== 'resolved')
        .slice(0, 5)
        .map(b => `  ⚠️ [${b.severity.toUpperCase()}] ${b.title}${b.description ? ': ' + b.description : ''}`)
        .join('\n')
    : '  No open blockers.'

  const docSummary = documents.length
    ? documents
        .slice(0, 5)
        .map(d => `  • ${d.file_name}: ${d.summary?.slice(0, 200) ?? '(no summary yet)'}`)
        .join('\n')
    : '  No documents uploaded.'

  const completedMemories = memories.filter(m => m.ingestion_status === 'complete')
  const memorySummary = completedMemories.length
    ? completedMemories
        .slice(0, 6)
        .map(m => `  [${m.source_type.toUpperCase()}] ${m.title}: ${m.summary?.slice(0, 250) ?? '(no summary)'}`)
        .join('\n')
    : '  No memory documents ingested.'

  const overviewSection = [
    project.current_phase ? `Phase: ${project.current_phase}` : null,
    project.current_status ? `Current status: ${project.current_status}` : null,
    project.risk_level ? `Risk: ${project.risk_level}` : null,
    project.next_step ? `Next step: ${project.next_step}` : null,
  ].filter(Boolean).join(' | ')

  return emailContext + `You are Z — a sharp, no-fluff AI command center assistant.
You help manage the ${project.name} project. You are direct, concise, and technically precise.

PROJECT: ${project.name}
STATUS: ${project.status.toUpperCase()}${overviewSection ? '\n' + overviewSection : ''}

DESCRIPTION:
${project.description ?? 'No description.'}

CURRENT TASKS:
${taskSummary}

OPEN BLOCKERS:
${blockerSummary}

UPLOADED DOCUMENTS:
${docSummary}

PROJECT MEMORY (ingested handovers, transcripts, architecture notes):
${memorySummary}

RECENT DECISIONS:
${decisionSummary}

RECENT NOTES:
${noteSummary}

RESPONSE RULES:
- Be direct and specific — no generic advice
- When asked "What next?", structure your response as:
  ## Current Status
  ## Next Exact Step
  ## Claude Code Prompt
  ## Warnings
  ## Architecture Reminders
  ## Blockers
- Use markdown formatting
- Claude Code prompts should be immediately copy-pasteable
- Flag blockers clearly with ⚠️
- Always tie recommendations back to the actual task data above
- When asked about documents, summarize the content from the UPLOADED DOCUMENTS section
- When asked about history, context, or past decisions, draw from PROJECT MEMORY section
- Treat memory summaries as verified project history — they came from handovers and transcripts
- When asked "What next?" or "What should I do?", respond with EXACTLY these sections:
  ## Current Situation
  ## Main Blockers
  ## Immediate Next Action
  ## Claude Code Prompt (fenced code block, copy-pasteable)
  ## Risks
  ## Do-Not-Break Rules
  ## Operational Warnings
  ## Recommended Priority`
}

export async function POST(req: NextRequest) {
  try {
    const { projectId, messages }: { projectId: string; messages: ChatMessage[] } = await req.json()

    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    if (!messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })

    const ctx = await getProjectContext(projectId)
    if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const emailContext = await buildEmailContext()

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(ctx, emailContext),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    return NextResponse.json({ message: content.text })
  } catch (err) {
    console.error('[/api/chat]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
