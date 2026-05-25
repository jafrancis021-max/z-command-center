import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { assembleAssistantContext } from '@/lib/assistant-context-assembler'
import { getRuntimeState, suggestedBehaviorForWarnings } from '@/lib/runtime-state'
import { recordMemoryRetrieval } from '@/lib/memory-freshness'
import { recordRetrievalTelemetry } from '@/lib/retrieval-telemetry'
import { getRecentReplayForChat, explainReplaySequence } from '@/lib/operational-replay'
import { getProceduralSuggestions, type ProceduralPattern } from '@/lib/procedural-reinforcement'
import { recordWorkflowLearningSignal } from '@/lib/workflow-learning'

export const dynamic = 'force-dynamic'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

async function buildOperationalContext(uid: string): Promise<string> {
  const db = getAdmin()

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
    .from('operational_cases')
    .select('id, title, status, priority, type, description')
    .in('status', ['open', 'in_progress', 'pending_approval'])
    .order('updated_at', { ascending: false })
    .limit(8)

  if (cases?.length) {
    lines.push(`ACTIVE CASES (${cases.length}):`)
    cases.forEach(c => {
      lines.push(`  [${c.status.toUpperCase()}][${c.priority}] ${c.title}${c.description ? ' — ' + (c.description as string).slice(0, 80) : ''}`)
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
    feed.forEach(e => lines.push(`  [${(e.severity as string).toUpperCase()}] ${e.title}`))
    lines.push('')
  }

  // Recent vault documents
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

  return lines.join('\n')
}

const REPLAY_INTENT      = /\b(what happened|show replay|replay|why did this happen|what changed|what events|recent activity)\b/i
const PROCEDURAL_INTENT  = /\b(how do we usually|how do you usually|usual(ly)?|standard procedure|typical(ly)?|pattern|workflow pattern|how (should|do) we handle)\b/i

function buildSystemPrompt(operationalCtx: string, memoryCtx: string, runtimeCtx: string, replayCtx = '', proceduralCtx = ''): string {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'morning' :
    hour < 17 ? 'afternoon' : 'evening'

  return `You are Z — the operational companion for this workspace.

It is ${greeting}. You are always professional, concise, and genuinely helpful.

You are NOT a generic AI chatbot. You are a trusted operational partner who understands this business's operations deeply.

${operationalCtx}
${memoryCtx ? memoryCtx + '\n' : ''}${runtimeCtx ? runtimeCtx + '\n' : ''}${replayCtx ? replayCtx + '\n' : ''}${proceduralCtx ? proceduralCtx + '\n' : ''}
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

    const { messages, context } = await req.json() as { messages: Message[]; context?: { path?: string; caseId?: string; workflowId?: string } }
    if (!messages?.length) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const lastUserMsg  = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const workspaceId  = await getCurrentWorkspaceId()

    // Detect replay intent — only fetch replay events when the user asks about history
    const wantsReplay      = REPLAY_INTENT.test(lastUserMsg)
    const wantsProcedural  = PROCEDURAL_INTENT.test(lastUserMsg)

    // Run all context assembly in parallel
    const [operationalCtx, memoryPayload, runtimeState, replayEvents, proceduralPatterns] = await Promise.all([
      buildOperationalContext(uid),
      assembleAssistantContext(lastUserMsg, workspaceId, {
        pathname:   context?.path,
        caseId:     context?.caseId,
        workflowId: context?.workflowId,
      }),
      getRuntimeState(),
      wantsReplay     ? getRecentReplayForChat(workspaceId, 6)                : Promise.resolve([]),
      wantsProcedural && workspaceId ? getProceduralSuggestions(workspaceId, 5) : Promise.resolve([] as ProceduralPattern[]),
    ])

    // Build runtime context block for system prompt (only when degraded/critical)
    let runtimeCtx = ''
    if (runtimeState.overall_status !== 'healthy' && runtimeState.warnings.length > 0) {
      const behavior = suggestedBehaviorForWarnings(runtimeState.warnings)
      const lines    = [
        'RUNTIME STATUS:',
        `⚠ ${runtimeState.warnings.length} runtime warning(s) — status: ${runtimeState.overall_status}`,
        ...runtimeState.warnings.map(w => `  [${w.level.toUpperCase()}] ${w.message}`),
        '',
        'RUNTIME BEHAVIOR RULES:',
        ...behavior,
      ]
      runtimeCtx = lines.join('\n')
    }

    // Build replay context block (only when replay intent detected and events exist)
    let replayCtx = ''
    if (wantsReplay && replayEvents.length > 0) {
      const lines = explainReplaySequence(replayEvents.slice().reverse(), 6)
      replayCtx = 'RECENT ACTIVITY (replay):\n' + lines.map(l => `  ${l}`).join('\n')
    }

    // Build procedural context block (only when procedural intent detected and patterns exist)
    let proceduralCtx = ''
    if (wantsProcedural && proceduralPatterns.length > 0) {
      const lines = [
        'KNOWN PROCEDURAL PATTERNS:',
        ...proceduralPatterns.map(p =>
          `  • ${p.pattern_name} — ${p.pattern_summary} (confidence ${(p.confidence_score * 100).toFixed(0)}%)`,
        ),
      ]
      proceduralCtx = lines.join('\n')
    }

    const systemPrompt = buildSystemPrompt(operationalCtx, memoryPayload.contextText, runtimeCtx, replayCtx, proceduralCtx)

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    after(() => recordMemoryRetrieval(memoryPayload.items.map(i => i.id)))

    if (wantsProcedural && proceduralPatterns.length > 0 && workspaceId) {
      after(() => recordWorkflowLearningSignal({
        workspaceId,
        signalType:    'assistant_suggested_procedure',
        signalSource:  'assistant',
        signalStrength: 1.0,
        metadata:      { patternCount: proceduralPatterns.length, intent: memoryPayload.intent },
      }))
    }

    after(() => recordRetrievalTelemetry({
      userMessage:          lastUserMsg,
      workspaceId,
      intent:               memoryPayload.intent,
      selectedModes:        memoryPayload.selectedModes,
      excludedModes:        memoryPayload.excludedModes,
      speculativeBlocked:   memoryPayload.speculativeBlocked,
      workspaceScopedCount: memoryPayload.workspaceScopedCount,
      globalFallbackCount:  memoryPayload.globalFallbackCount,
      globalFallbackUsed:   memoryPayload.globalFallbackUsed,
      topMemoryScore:       memoryPayload.topMemoryScore,
      itemIds:              memoryPayload.items.map(i => i.id),
      itemCount:            memoryPayload.items.length,
      temperatureDist:      memoryPayload.temperatureWeighting,
    }))

    return NextResponse.json({
      message: content.text,
      _debug: {
        intent:                  memoryPayload.intent,
        selectedModes:           memoryPayload.selectedModes,
        speculativeBlocked:      memoryPayload.speculativeBlocked,
        memoryItemCount:         memoryPayload.items.length,
        // Phase 5 — workspace scope
        workspaceId:             memoryPayload.workspaceId,
        workspaceScopedMemoryCount: memoryPayload.workspaceScopedCount,
        globalFallbackCount:     memoryPayload.globalFallbackCount,
        topMemoryScore:          memoryPayload.topMemoryScore,
        // Phase 4 — runtime
        runtimeStatus:           runtimeState.overall_status,
        runtimeWarnings:         runtimeState.warnings.length,
      },
    })
  } catch (err) {
    console.error('[api/assistant/chat]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
