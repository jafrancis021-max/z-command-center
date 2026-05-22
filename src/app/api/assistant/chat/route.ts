import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin } from '@/lib/supabase-server'
import { getRelevantMemoryLayers } from '@/lib/retrieval-policy'
import type { MemoryLayer } from '@/types'

export const dynamic = 'force-dynamic'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

async function buildWorkspaceContext(uid: string, query: string, pathname?: string): Promise<string> {
  const db = getAdmin()

  // Fetch user profile
  const { data: profile } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('auth_id', uid)
    .single()

  const lines: string[] = []
  lines.push(`MEMBER: ${profile?.full_name ?? 'Operator'} (${profile?.email ?? 'unknown'})`)
  lines.push('')

  // Active cases
  const { data: cases } = await db
    .from('cases')
    .select('id, title, status, priority, type, description')
    .in('status', ['open', 'in_progress', 'pending_approval'])
    .order('updated_at', { ascending: false })
    .limit(8)

  if (cases?.length) {
    lines.push(`ACTIVE CASES (${cases.length}):`)
    cases.forEach(c => {
      lines.push(`  [${c.status.toUpperCase()}][${c.priority}] ${c.title}${c.description ? ' — ' + c.description.slice(0, 80) : ''}`)
    })
    lines.push('')
  }

  // Pending approvals
  const { data: approvals } = await db
    .from('approvals')
    .select('id, title, approval_type, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5)

  if (approvals?.length) {
    lines.push(`PENDING APPROVALS (${approvals.length}):`)
    approvals.forEach(a => lines.push(`  • [${a.approval_type}] ${a.title}`))
    lines.push('')
  }

  // Recent feed events
  const { data: feed } = await db
    .from('operational_feed_events')
    .select('title, event_type, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(6)

  if (feed?.length) {
    lines.push('RECENT OPERATIONAL EVENTS:')
    feed.forEach(e => lines.push(`  [${e.severity.toUpperCase()}] ${e.title}`))
    lines.push('')
  }

  // Operational insights
  const { data: insights } = await db
    .from('operational_insights')
    .select('title, severity, area, recommendation')
    .in('severity', ['critical', 'high'])
    .order('created_at', { ascending: false })
    .limit(4)

  if (insights?.length) {
    lines.push('HIGH-PRIORITY INSIGHTS:')
    insights.forEach(i => lines.push(`  [${i.severity.toUpperCase()}][${i.area}] ${i.title}: ${i.recommendation?.slice(0, 100) ?? ''}`))
    lines.push('')
  }

  // Recent documents in vault
  const { data: docs } = await db
    .from('intake_documents')
    .select('original_name, category, status, created_at')
    .order('created_at', { ascending: false })
    .limit(4)

  if (docs?.length) {
    lines.push('RECENT VAULT DOCUMENTS:')
    docs.forEach(d => lines.push(`  [${d.status}][${d.category}] ${d.original_name}`))
    lines.push('')
  }

  // Operational memory — retrieval-policy gated, never dumps think_tank by default
  const allowedLayers: MemoryLayer[] = getRelevantMemoryLayers(query, { pathname })
  if (allowedLayers.length > 0 && !allowedLayers.includes('think_tank')) {
    const { data: memItems } = await db
      .from('operational_memory_items')
      .select('title, memory_layer, category, content')
      .in('memory_layer', allowedLayers)
      .eq('assistant_default_access', true)
      .eq('status', 'active')
      .order('retrieval_priority', { ascending: false })
      .limit(6)

    if (memItems?.length) {
      lines.push('OPERATIONAL MEMORY:')
      memItems.forEach(m => lines.push(`  [${m.memory_layer.toUpperCase()}][${m.category}] ${m.title}: ${(m.content as string).slice(0, 120)}`))
      lines.push('')
    }
  }

  return lines.join('\n')
}

function buildSystemPrompt(ctx: string): string {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'morning' :
    hour < 17 ? 'afternoon' : 'evening'

  return `You are Z — the operational companion for this workspace.

It is ${greeting}. You are always professional, concise, and genuinely helpful.

You are NOT a generic AI chatbot. You are a trusted operational partner who understands this business's operations deeply.

${ctx}

YOUR ROLE:
- Guide the member through their operational work
- Proactively surface what needs immediate attention
- Help create and manage workflows
- Explain operational patterns and pressure
- Help navigate the vault, cases, and workflows
- Be their trusted operational intelligence layer

NAVIGATION GUIDE (tell users how to navigate Z):
- Dashboard: /dashboard — operational overview
- Vault: /vault — upload documents, add notes, add screenshots
- Cases: /cases — manage operational cases
- Intelligence: /insights — pressure, bottlenecks, recommendations
- Workflows: /workflows — automation and workflow management
- Timeline: /timeline — operational replay and audit history
- Connections: /connections — Gmail, Calendar, integrations
- Security: /security — trust and integrity status
- Audit Trail: /audit — tamper-evident event log
- System Proof: /system-proof — infrastructure health check
- Launch Checklist: /launch-checklist — getting started guide

BEHAVIOR RULES:
- Never invent operational data — only reference what is in the context above
- Cite specific cases by title when relevant
- Be direct and actionable — no filler text
- When asked "What should I do?", surface the 2-3 most critical items from the context
- Format responses clearly with bullet points when listing multiple items
- Keep responses focused — don't overwhelm with information
- When asked to navigate somewhere, explain what they'll find there
- Always be aware the member can see the workspace on their left — refer to specific sections

TONE:
Calm. Premium. Operational. Trustworthy. Professional. Like a senior operations director who knows the business intimately.`
}

export async function POST(req: NextRequest) {
  try {
    const uid = req.cookies.get('z_uid')?.value
    if (!uid) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { messages, context } = await req.json() as { messages: Message[]; context?: { path?: string } }
    if (!messages?.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const ctx = await buildWorkspaceContext(uid, lastUserMsg, context?.path)
    const systemPrompt = buildSystemPrompt(ctx)

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    return NextResponse.json({ message: content.text })
  } catch (err) {
    console.error('[api/assistant/chat]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
