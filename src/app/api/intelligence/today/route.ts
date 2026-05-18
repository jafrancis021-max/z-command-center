import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json() as { project_id?: string }
    const db = getAdmin()

    // Gather data across all (or one) project(s)
    let projectsQuery = db.from('projects').select('*').neq('status', 'archived')
    if (project_id) projectsQuery = projectsQuery.eq('id', project_id)
    const { data: projects } = await projectsQuery

    if (!projects?.length) {
      return NextResponse.json({ priorities: 'No active projects found.' })
    }

    const projectIds = projects.map(p => p.id)

    const [blockers, tasks, sessions] = await Promise.all([
      db.from('blockers').select('*').in('project_id', projectIds).neq('status', 'resolved').order('created_at', { ascending: false }),
      db.from('tasks').select('*').in('project_id', projectIds).neq('status', 'done').order('created_at', { ascending: false }),
      db.from('claude_sessions').select('*').in('project_id', projectIds).order('created_at', { ascending: false }).limit(10),
    ])

    const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]))

    const blockerLines = (blockers.data ?? []).map(b =>
      `  [${(b.severity as string).toUpperCase()}] ${projectMap[b.project_id as string] ?? '?'} — ${b.title}${b.description ? ': ' + b.description : ''}`
    ).join('\n') || '  None'

    const taskLines = (tasks.data ?? []).slice(0, 15).map(t =>
      `  [${(t.priority as string).toUpperCase()}][${t.status}] ${projectMap[t.project_id as string] ?? '?'} — ${t.title}`
    ).join('\n') || '  None'

    const projectStateLines = projects.map(p =>
      `  ${p.name} | status=${p.current_status ?? 'unknown'} | risk=${p.risk_level ?? 'unknown'} | next=${p.next_step ?? 'not set'} | blocker=${p.main_blocker ?? 'none'}`
    ).join('\n')

    const sessionLines = (sessions.data ?? []).slice(0, 5).map(s =>
      `  [${s.status}] ${projectMap[s.project_id as string] ?? '?'} — ${(s.prompt as string).slice(0, 120)}`
    ).join('\n') || '  No recent sessions'

    const prompt = `You are Z — operational intelligence system. Analyze this operator state and generate a sharp, prioritized operational briefing.

TODAY'S DATE: ${new Date().toDateString()}

PROJECTS:
${projectStateLines}

OPEN BLOCKERS:
${blockerLines}

OPEN TASKS (top 15):
${taskLines}

RECENT CLAUDE SESSIONS:
${sessionLines}

Generate a crisp operational briefing with these exact sections:

## TODAY'S PRIORITIES
Ranked list (1-5) of what to work on TODAY. Be specific. Include project name, exact action, why it's urgent.

## CRITICAL WARNINGS
Any blockers or risks that could cause failure if ignored today. Max 3.

## SUGGESTED CLAUDE CODE PROMPTS
1-3 ready-to-paste Claude Code prompts for the highest-priority actions. Format as fenced code blocks.

## STALLED PROJECTS
Any projects with no recent activity, no next step defined, or multiple open blockers.

## RECOMMENDED FOCUS
One sentence: the single most important thing to do right now.

Be direct. No filler. No generic advice.`

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const priorities = res.content[0].type === 'text' ? res.content[0].text : 'Failed to generate priorities.'

    await logAction({
      action_type: 'intelligence_today',
      project_id: project_id ?? null,
      summary: `Generated today\'s priorities for ${projects.length} project(s)`,
      status: 'completed',
    })

    return NextResponse.json({ priorities, generated_at: new Date().toISOString() })
  } catch (err) {
    console.error('[/api/intelligence/today]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate priorities' },
      { status: 500 }
    )
  }
}
