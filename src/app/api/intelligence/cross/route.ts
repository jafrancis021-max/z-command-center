import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(_req: NextRequest) {
  try {
    const db = getAdmin()

    const { data: projects } = await db.from('projects').select('*').neq('status', 'archived')
    if (!projects?.length) return NextResponse.json({ observations: [], raw: '' })

    const projectIds = projects.map(p => p.id)

    const [blockers, archRules, decisions, tasks] = await Promise.all([
      db.from('blockers').select('*').in('project_id', projectIds).neq('status', 'resolved'),
      db.from('architecture_rules').select('*').in('project_id', projectIds),
      db.from('decisions').select('*').in('project_id', projectIds).order('created_at', { ascending: false }),
      db.from('tasks').select('*').in('project_id', projectIds).neq('status', 'done'),
    ])

    const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name as string]))

    const projectSections = projects.map(p => {
      const pBlockers = (blockers.data ?? []).filter(b => b.project_id === p.id).map(b => `    [${b.severity}] ${b.title}`).join('\n') || '    none'
      const pArch = (archRules.data ?? []).filter(a => a.project_id === p.id).map(a => `    [${a.category}] ${a.rule}`).join('\n') || '    none'
      const pDecisions = (decisions.data ?? []).filter(d => d.project_id === p.id).slice(0, 5).map(d => `    • ${d.decision}`).join('\n') || '    none'
      const pTasks = (tasks.data ?? []).filter(t => t.project_id === p.id).map(t => `    [${t.status}][${t.priority}] ${t.title}`).join('\n') || '    none'
      return `PROJECT: ${p.name} (risk=${p.risk_level ?? 'unknown'}, phase=${p.current_phase ?? 'unknown'})
  BLOCKERS:
${pBlockers}
  ARCHITECTURE:
${pArch}
  RECENT DECISIONS:
${pDecisions}
  OPEN TASKS:
${pTasks}`
    }).join('\n\n')

    const prompt = `You are Z — operational intelligence system. Analyze all projects below and identify CROSS-PROJECT patterns, repeated blockers, shared architectural decisions, and knowledge transfer opportunities.

${projectSections}

Return a JSON array of observations. Each observation:
{
  "type": "pattern" | "blocker" | "opportunity" | "warning",
  "title": "Short title (max 10 words)",
  "body": "2-3 sentence explanation with specific project references",
  "projects": ["ProjectA", "ProjectB"]
}

Examples of what to look for:
- Same class of blocker appearing in 2+ projects
- Architecture decision in one project that would benefit another
- A task pattern that keeps repeating across projects
- A warning about a shared dependency or risk
- A workflow from one project that solves a problem in another

Return ONLY valid JSON array, no other text. Limit to 6 most important observations.`

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    let observations: unknown[] = []
    if (jsonMatch) {
      try { observations = JSON.parse(jsonMatch[0]) } catch { /* fallback to raw */ }
    }

    await logAction({
      action_type: 'cross_project_analysis',
      summary: `Cross-project analysis across ${projects.length} projects — ${observations.length} observations`,
      status: 'completed',
    })

    return NextResponse.json({
      observations: Array.isArray(observations) ? observations : [],
      raw: observations.length === 0 ? raw : null,
      project_names: projects.map(p => projectMap[p.id]),
    })
  } catch (err) {
    console.error('[/api/intelligence/cross]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    )
  }
}
