import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import type { HealthStatus, ProjectHealth } from '@/types'

function computeHealth(
  project: Record<string, unknown>,
  blockers: Array<Record<string, unknown>>,
  tasks: Array<Record<string, unknown>>,
  lastSession: Record<string, unknown> | null,
): ProjectHealth {
  const reasons: string[] = []
  let score = 100

  // Critical blockers
  const criticalBlockers = blockers.filter(b => b.severity === 'critical')
  const highBlockers = blockers.filter(b => b.severity === 'high')
  if (criticalBlockers.length > 0) {
    score -= criticalBlockers.length * 25
    reasons.push(`${criticalBlockers.length} critical blocker(s)`)
  }
  if (highBlockers.length > 0) {
    score -= highBlockers.length * 10
    reasons.push(`${highBlockers.length} high blocker(s)`)
  }
  if (blockers.length > 4) {
    score -= 15
    reasons.push(`${blockers.length} open blockers`)
  }

  // Risk level
  const risk = project.risk_level as string | null
  if (risk === 'critical') { score -= 20; reasons.push('risk: critical') }
  else if (risk === 'high') { score -= 10; reasons.push('risk: high') }

  // No next step
  if (!project.next_step) {
    score -= 10
    reasons.push('no next step defined')
  }

  // Blocked tasks
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  if (blockedTasks.length > 0) {
    score -= blockedTasks.length * 5
    reasons.push(`${blockedTasks.length} task(s) blocked`)
  }

  // No recent Claude session
  if (!lastSession) {
    score -= 5
    reasons.push('no recent Claude activity')
  } else {
    const sessionAge = Date.now() - new Date(lastSession.created_at as string).getTime()
    const dayMs = 86400000
    if (sessionAge > 7 * dayMs) {
      score -= 10
      reasons.push('no Claude activity in 7+ days')
    }
  }

  // Project status
  if (project.status === 'paused') { score -= 15; reasons.push('project paused') }

  score = Math.max(0, Math.min(100, score))

  let status: HealthStatus
  if (score >= 75) status = 'STRONG'
  else if (score >= 50) status = 'ACTIVE'
  else if (score >= 25) status = 'STALLED'
  else status = 'AT_RISK'

  if (reasons.length === 0) reasons.push('no issues detected')

  return {
    project_id: project.id as string,
    project_name: project.name as string,
    status,
    score,
    reasons,
  }
}

export async function GET() {
  try {
    const db = getAdmin()
    const { data: projects } = await db.from('projects').select('*').neq('status', 'archived')
    if (!projects?.length) return NextResponse.json({ health: [] })

    const projectIds = projects.map(p => p.id)
    const [blockerRows, taskRows, sessionRows] = await Promise.all([
      db.from('blockers').select('*').in('project_id', projectIds).neq('status', 'resolved'),
      db.from('tasks').select('*').in('project_id', projectIds).neq('status', 'done'),
      db.from('claude_sessions').select('project_id, created_at, status').in('project_id', projectIds).order('created_at', { ascending: false }),
    ])

    const health = projects.map(project => {
      const pBlockers = (blockerRows.data ?? []).filter(b => b.project_id === project.id)
      const pTasks = (taskRows.data ?? []).filter(t => t.project_id === project.id)
      const pLastSession = (sessionRows.data ?? []).find(s => s.project_id === project.id) ?? null
      return computeHealth(
        project as Record<string, unknown>,
        pBlockers as Array<Record<string, unknown>>,
        pTasks as Array<Record<string, unknown>>,
        pLastSession as Record<string, unknown> | null,
      )
    })

    return NextResponse.json({ health })
  } catch (err) {
    console.error('[/api/intelligence/health]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
