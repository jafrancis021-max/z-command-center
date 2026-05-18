import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json() as { project_id: string }
    if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const db = getAdmin()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    const [project, tasks, decisions, blockers, sessions, timeline] = await Promise.all([
      db.from('projects').select('*').eq('id', project_id).single(),
      db.from('tasks').select('*').eq('project_id', project_id).gte('created_at', sevenDaysAgo),
      db.from('decisions').select('*').eq('project_id', project_id).gte('created_at', sevenDaysAgo),
      db.from('blockers').select('*').eq('project_id', project_id).gte('created_at', sevenDaysAgo),
      db.from('claude_sessions').select('*, results:session_results(*)').eq('project_id', project_id).gte('created_at', sevenDaysAgo),
      db.from('project_timeline_events').select('*').eq('project_id', project_id).gte('created_at', sevenDaysAgo).order('created_at', { ascending: true }),
    ])

    if (!project.data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const p = project.data

    const taskLines = (tasks.data ?? []).map(t => `  [${t.status}][${t.priority}] ${t.title}`).join('\n') || '  None'
    const decisionLines = (decisions.data ?? []).map(d => `  • ${d.decision}`).join('\n') || '  None'
    const blockerLines = (blockers.data ?? []).map(b => `  ⚠️ [${b.severity}] ${b.title}`).join('\n') || '  None'
    const sessionLines = (sessions.data ?? []).map(s =>
      `  [${s.status}] ${(s.prompt as string).slice(0, 100)}`
    ).join('\n') || '  None'
    const timelineLines = (timeline.data ?? []).map(e => `  ${e.event_type}: ${e.title}`).join('\n') || '  None'

    const prompt = `Generate a weekly operational report for the ${p.name} project.

PROJECT STATE:
- Current Phase: ${p.current_phase ?? 'not set'}
- Status: ${p.current_status ?? 'not set'}
- Risk Level: ${p.risk_level ?? 'unknown'}
- Main Blocker: ${p.main_blocker ?? 'none'}
- Next Step: ${p.next_step ?? 'not set'}

THIS WEEK'S TASKS:
${taskLines}

THIS WEEK'S DECISIONS:
${decisionLines}

THIS WEEK'S BLOCKERS:
${blockerLines}

CLAUDE SESSIONS THIS WEEK:
${sessionLines}

TIMELINE EVENTS:
${timelineLines}

Generate a structured weekly report with these sections:

## WEEK IN REVIEW — ${p.name}
Date: ${new Date().toDateString()}

## WHAT HAPPENED
Summary of key activities, changes, and progress this week.

## SUCCESSES
What went well. What was shipped or completed.

## BLOCKERS & FAILURES
What went wrong or what is stopping progress. Be specific.

## DECISIONS MADE
Key decisions recorded this week and their rationale.

## NEXT WEEK'S PRIORITIES
Top 3-5 actions for next week, ranked by importance.

## RISKS TO WATCH
Current risks that need monitoring next week.

Be specific and factual. Use the data above. No filler.`

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const report_text = res.content[0].type === 'text' ? res.content[0].text : 'Report generation failed.'

    const { data: report } = await db.from('weekly_reports').insert({
      project_id,
      report_text,
    }).select().single()

    // Add timeline event
    await db.from('project_timeline_events').insert({
      project_id,
      event_type: 'milestone',
      title: 'Weekly report generated',
      description: `Auto-generated weekly report for week of ${new Date().toDateString()}`,
      metadata: { report_id: report?.id },
    })

    await logAction({
      action_type: 'weekly_report_generated',
      entity_type: 'weekly_report',
      entity_id: report?.id,
      project_id,
      summary: `Generated weekly report for ${p.name}`,
      status: 'completed',
    })

    return NextResponse.json({ report: report ?? { report_text }, report_text })
  } catch (err) {
    console.error('[/api/intelligence/weekly]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Report generation failed' },
      { status: 500 }
    )
  }
}
