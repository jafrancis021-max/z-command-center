// Operational Intelligence Engine — Phase 4C
// Analyzes the case graph to detect pressure, stalls, and workflow degradation.
// All logic is deterministic — no AI inference. Every insight explains its evidence.

import { getAdmin, logAction } from './supabase-server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type PressureLevel  = 'low' | 'moderate' | 'elevated' | 'critical'
export type WorkflowHealth = 'healthy' | 'degraded' | 'critical'

export interface PressureFactor {
  name:         string
  contribution: number
  detail:       string
}

export interface CasePressureResult {
  case_id:         string
  case_title:      string
  case_status:     string
  pressure_score:  number      // 0–100
  pressure_level:  PressureLevel
  pressure_reason: string      // primary factor detail
  factors:         PressureFactor[]
}

export interface StalledCase {
  case_id:       string
  case_title:    string
  case_status:   string
  last_activity: string | null  // ISO
  stalled_hours: number
}

export interface WorkflowDegradation {
  workflow_chain_id: string
  workflow_name:     string
  failure_count:     number
  stall_count:       number
  health_status:     WorkflowHealth
  reason:            string
  related_case_ids:  string[]
}

export interface Hotspot {
  entity:   string
  issue:    string
  severity: string
}

export interface IntelligenceResult {
  generated_at:         string
  duration_ms:          number
  cases_analyzed:       number
  case_pressures:       CasePressureResult[]
  stalled_cases:        StalledCase[]
  workflow_degradation: WorkflowDegradation[]
  insights_upserted:    number
  hotspots:             Hotspot[]
}

// ── Internal row shapes ───────────────────────────────────────────────────────

type CaseRow       = { id: string; title: string; status: string; priority: string; created_at: string; updated_at: string }
type LinkRow       = { id: string; case_id: string; entity_type: string; entity_id: string; created_at: string }
type ApprovalRow   = { id: string; status: string; created_at: string }
type NotifRow      = { id: string; severity: string; dismissed: boolean }
type ChainRunRow   = { id: string; workflow_chain_id: string; status: string; created_at: string; updated_at: string }
type IntakeRow     = { id: string; case_id: string; created_at: string }
type InsightKeyRow = { insight_key: string; status: string }

// ── Pressure scoring ──────────────────────────────────────────────────────────

function scorePressure(params: {
  pendingApprovals:   number
  stalledWorkflows:   number
  criticalNotifs:     number
  inactivityHours:    number
  pendingApprovalAge: number  // hours in pending_approval status
}): { score: number; level: PressureLevel; reason: string; factors: PressureFactor[] } {
  const factors: PressureFactor[] = []
  let raw = 0

  function add(name: string, contribution: number, detail: string) {
    if (contribution <= 0) return
    raw += contribution
    factors.push({ name, contribution, detail })
  }

  add(
    'Pending approvals',
    Math.min(45, params.pendingApprovals * 15),
    `${params.pendingApprovals} linked approval${params.pendingApprovals !== 1 ? 's' : ''} awaiting decision`,
  )
  add(
    'Stalled workflows',
    Math.min(30, params.stalledWorkflows * 12),
    `${params.stalledWorkflows} workflow chain${params.stalledWorkflows !== 1 ? 's' : ''} stalled or failed`,
  )
  add(
    'Critical alerts',
    Math.min(24, params.criticalNotifs * 8),
    `${params.criticalNotifs} unread critical notification${params.criticalNotifs !== 1 ? 's' : ''}`,
  )

  if      (params.inactivityHours >= 72) add('Inactivity', 25, `No timeline activity for ${Math.round(params.inactivityHours / 24)}d`)
  else if (params.inactivityHours >= 48) add('Inactivity', 18, `No timeline activity for ${Math.round(params.inactivityHours)}h`)
  else if (params.inactivityHours >= 24) add('Inactivity', 10, `No timeline activity for ${Math.round(params.inactivityHours)}h`)

  if      (params.pendingApprovalAge >= 48) add('Approval SLA breach', 20, `Case pending approval for ${Math.round(params.pendingApprovalAge)}h`)
  else if (params.pendingApprovalAge >= 24) add('Approval delay',      10, `Case pending approval for ${Math.round(params.pendingApprovalAge)}h`)

  const score = Math.min(100, raw)
  const level: PressureLevel =
    score >= 76 ? 'critical' :
    score >= 51 ? 'elevated' :
    score >= 26 ? 'moderate' : 'low'

  factors.sort((a, b) => b.contribution - a.contribution)
  const reason = factors[0]?.detail ?? 'No pressure factors detected'

  return { score, level, reason, factors }
}

// ── Insight builder ───────────────────────────────────────────────────────────

type InsightRow = {
  insight_key:          string
  insight_type:         string
  severity:             string
  confidence:           number
  area:                 string
  title:                string
  description:          string
  why_it_matters:       string
  recommendation:       string
  source_ids:           string[]
  related_case_id:      string | null
  evidence:             string
  related_entity_type:  string | null
  related_entity_id:    string | null
  workspace_id:         string | null
  status:               'active'
  metadata:             Record<string, unknown>
}

function makeInsight(partial: Omit<InsightRow, 'status'>): InsightRow {
  return { ...partial, status: 'active' }
}

// ── Main engine ───────────────────────────────────────────────────────────────

export async function runOperationalIntelligence(
  workspaceId: string | null,
): Promise<IntelligenceResult> {
  const db    = getAdmin()
  const start = Date.now()
  const now   = new Date()
  const since7d  = new Date(now.getTime() - 7  * 86_400_000).toISOString()
  const since48h = new Date(now.getTime() - 48 * 3_600_000)

  // ── 1. Active cases ───────────────────────────────────────────────────────
  let caseQ = db
    .from('operational_cases')
    .select('id, title, status, priority, created_at, updated_at')
    .in('status', ['open', 'in_progress', 'pending_approval'])
    .order('updated_at', { ascending: false })
    .limit(60)
  if (workspaceId) caseQ = caseQ.eq('workspace_id', workspaceId)

  const { data: casesRaw } = await caseQ
  const cases     = (casesRaw ?? []) as CaseRow[]
  const caseIds   = cases.map(c => c.id)

  if (caseIds.length === 0) {
    return {
      generated_at: now.toISOString(), duration_ms: Date.now() - start,
      cases_analyzed: 0, case_pressures: [], stalled_cases: [],
      workflow_degradation: [], insights_upserted: 0, hotspots: [],
    }
  }

  // ── 2. All case_links for these cases (single query) ─────────────────────
  const { data: linksRaw } = await db
    .from('case_links')
    .select('id, case_id, entity_type, entity_id, created_at')
    .in('case_id', caseIds)
    .order('created_at', { ascending: false })

  const allLinks = (linksRaw ?? []) as LinkRow[]

  // Group links by case
  const linksByCaseId: Record<string, LinkRow[]> = {}
  for (const l of allLinks) (linksByCaseId[l.case_id] ??= []).push(l)

  // Collect entity IDs by type
  const approvalIds    = allLinks.filter(l => l.entity_type === 'approval').map(l => l.entity_id)
  const notifIds       = allLinks.filter(l => l.entity_type === 'notification').map(l => l.entity_id)
  const chainRunIds    = allLinks.filter(l => l.entity_type === 'workflow_chain_run').map(l => l.entity_id)

  // ── 3. Batch fetch referenced entities ───────────────────────────────────
  const [approvalRes, notifRes, chainRunRes, intakeRes] = await Promise.all([
    approvalIds.length > 0
      ? db.from('approvals').select('id, status, created_at').in('id', approvalIds)
      : Promise.resolve({ data: [] as ApprovalRow[] }),
    notifIds.length > 0
      ? db.from('notifications').select('id, severity, dismissed').in('id', notifIds)
      : Promise.resolve({ data: [] as NotifRow[] }),
    chainRunIds.length > 0
      ? db.from('workflow_chain_runs').select('id, workflow_chain_id, status, created_at, updated_at').in('id', chainRunIds)
      : Promise.resolve({ data: [] as ChainRunRow[] }),
    db.from('intake_documents').select('id, case_id, created_at').in('case_id', caseIds).order('created_at', { ascending: false }),
  ])

  const approvalMap  = Object.fromEntries(((approvalRes.data  ?? []) as ApprovalRow[]).map(a => [a.id, a]))
  const notifMap     = Object.fromEntries(((notifRes.data     ?? []) as NotifRow[]).map(n => [n.id, n]))
  const chainRunMap  = Object.fromEntries(((chainRunRes.data  ?? []) as ChainRunRow[]).map(r => [r.id, r]))
  const intakeByCase: Record<string, IntakeRow[]> = {}
  for (const d of ((intakeRes.data ?? []) as IntakeRow[])) (intakeByCase[d.case_id] ??= []).push(d)

  // ── 4. Score pressure per case ────────────────────────────────────────────
  const casePressures: CasePressureResult[] = []

  for (const c of cases) {
    const links  = linksByCaseId[c.id] ?? []
    const intake = intakeByCase[c.id]  ?? []

    const pendingApprovals = links
      .filter(l => l.entity_type === 'approval' && approvalMap[l.entity_id]?.status === 'pending')
      .length

    const stalledWorkflows = links
      .filter(l => l.entity_type === 'workflow_chain_run')
      .filter(l => ['waiting_approval', 'failed'].includes(chainRunMap[l.entity_id]?.status ?? ''))
      .length

    const criticalNotifs = links
      .filter(l => l.entity_type === 'notification')
      .filter(l => notifMap[l.entity_id]?.severity === 'critical' && !notifMap[l.entity_id]?.dismissed)
      .length

    // Latest activity across links + intake
    const allTimes = [
      ...links.map(l => l.created_at),
      ...intake.map(d => d.created_at),
    ].sort().reverse()
    const latestActivity  = allTimes[0] ?? c.created_at
    const inactivityHours = (now.getTime() - new Date(latestActivity).getTime()) / 3_600_000

    const pendingApprovalAge = c.status === 'pending_approval'
      ? (now.getTime() - new Date(c.updated_at).getTime()) / 3_600_000
      : 0

    const { score, level, reason, factors } = scorePressure({
      pendingApprovals, stalledWorkflows, criticalNotifs, inactivityHours, pendingApprovalAge,
    })

    casePressures.push({ case_id: c.id, case_title: c.title, case_status: c.status, pressure_score: score, pressure_level: level, pressure_reason: reason, factors })
  }

  // ── 5. Stalled cases ──────────────────────────────────────────────────────
  const stalledCases: StalledCase[] = []

  for (const c of cases) {
    const links  = linksByCaseId[c.id] ?? []
    const intake = intakeByCase[c.id]  ?? []

    const allTimes = [
      ...links.map(l => new Date(l.created_at)),
      ...intake.map(d => new Date(d.created_at)),
    ].sort((a, b) => b.getTime() - a.getTime())

    const latest = allTimes[0]
    if (!latest || latest < since48h) {
      const stalledHours = latest
        ? (now.getTime() - latest.getTime()) / 3_600_000
        : (now.getTime() - new Date(c.created_at).getTime()) / 3_600_000
      stalledCases.push({
        case_id:       c.id,
        case_title:    c.title,
        case_status:   c.status,
        last_activity: latest?.toISOString() ?? null,
        stalled_hours: Math.round(stalledHours),
      })
    }
  }

  // ── 6. Workflow degradation ───────────────────────────────────────────────
  const { data: allChainRunsRaw } = await db
    .from('workflow_chain_runs')
    .select('id, workflow_chain_id, status, created_at, updated_at')
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(300)

  const allChainRuns = (allChainRunsRaw ?? []) as ChainRunRow[]
  const chainIdSet   = [...new Set(allChainRuns.map(r => r.workflow_chain_id))]

  // Fetch chain names
  const chainNames: Record<string, string> = {}
  if (chainIdSet.length > 0) {
    const { data: chainsRaw } = await db.from('workflow_chains').select('id, name').in('id', chainIdSet)
    for (const ch of ((chainsRaw ?? []) as { id: string; name: string }[])) chainNames[ch.id] = ch.name
  }

  // Group runs by chain
  const byChain: Record<string, ChainRunRow[]> = {}
  for (const r of allChainRuns) (byChain[r.workflow_chain_id] ??= []).push(r)

  const workflowDegradation: WorkflowDegradation[] = []
  const since24hMs = 24 * 3_600_000

  for (const [chainId, runs] of Object.entries(byChain)) {
    const failed   = runs.filter(r => r.status === 'failed')
    const stalling = runs.filter(r =>
      r.status === 'waiting_approval' &&
      now.getTime() - new Date(r.created_at).getTime() > since24hMs
    )

    let health: WorkflowHealth = 'healthy'
    let reason = 'Operating normally'

    if (failed.length >= 5) {
      health = 'critical'
      reason = `${failed.length} failures in last 7 days`
    } else if (failed.length >= 3) {
      health = 'degraded'
      reason = `${failed.length} failures in last 7 days`
    } else if (stalling.length >= 2) {
      health = 'degraded'
      reason = `${stalling.length} runs stuck awaiting approval >24h`
    } else if (failed.length >= 1 && stalling.length >= 1) {
      health = 'degraded'
      reason = `${failed.length} failure and ${stalling.length} stalled run`
    }

    if (health === 'healthy') continue

    const problemRunIds    = [...failed, ...stalling].map(r => r.id)
    const relatedCaseIds   = allLinks
      .filter(l => l.entity_type === 'workflow_chain_run' && problemRunIds.includes(l.entity_id))
      .map(l => l.case_id)
      .filter((id, i, arr) => arr.indexOf(id) === i)

    workflowDegradation.push({
      workflow_chain_id: chainId,
      workflow_name:     chainNames[chainId] ?? `chain:${chainId.slice(0, 8)}`,
      failure_count:     failed.length,
      stall_count:       stalling.length,
      health_status:     health,
      reason,
      related_case_ids:  relatedCaseIds,
    })
  }

  // ── 7. Build insights ─────────────────────────────────────────────────────
  const insightRows: InsightRow[] = []

  // Pressure warning (elevated + critical cases)
  for (const p of casePressures) {
    if (p.pressure_level === 'low' || p.pressure_level === 'moderate') continue
    const sev = p.pressure_level === 'critical' ? 'critical' : 'high'
    insightRows.push(makeInsight({
      insight_key:          `pressure_warning:${p.case_id}`,
      insight_type:         'pressure_warning',
      severity:             sev,
      confidence:           Math.min(90, 50 + p.pressure_score),
      area:                 'general',
      title:                `${sev === 'critical' ? 'Critical' : 'Elevated'} pressure: "${p.case_title}"`,
      description:          `Case "${p.case_title}" has pressure score ${p.pressure_score}/100 (${p.pressure_level}). Primary driver: ${p.pressure_reason}`,
      why_it_matters:       'Elevated-pressure cases are at risk of SLA breach and operational stall. Each contributing factor compounds the others.',
      recommendation:       `Resolve primary factor: ${p.pressure_reason}. Review the case timeline to identify the most recent blocker.`,
      source_ids:           [p.case_id],
      related_case_id:      p.case_id,
      evidence:             `Score: ${p.pressure_score}/100. Factors: ${p.factors.map(f => `${f.name} (+${f.contribution})`).join(', ')}`,
      related_entity_type:  'operational_case',
      related_entity_id:    p.case_id,
      workspace_id:         workspaceId,
      metadata:             { pressure_score: p.pressure_score, pressure_level: p.pressure_level, factors: p.factors },
    }))
  }

  // Stalled case insights
  for (const sc of stalledCases) {
    insightRows.push(makeInsight({
      insight_key:          `stalled_case:${sc.case_id}`,
      insight_type:         'stalled_case',
      severity:             sc.stalled_hours >= 96 ? 'high' : 'medium',
      confidence:           90,
      area:                 'general',
      title:                `Stalled case: "${sc.case_title}"`,
      description:          `Case "${sc.case_title}" (${sc.case_status}) has had no linked activity for ${sc.stalled_hours}h.`,
      why_it_matters:       'Inactive cases signal stalled operational work. Without intervention, cases risk SLA breach or permanent abandonment.',
      recommendation:       'Review the case. Update status, assign an owner, or close/archive if resolved.',
      source_ids:           [sc.case_id],
      related_case_id:      sc.case_id,
      evidence:             `Last activity: ${sc.last_activity ? new Date(sc.last_activity).toLocaleString() : 'none on record'}. Stalled ${sc.stalled_hours}h.`,
      related_entity_type:  'operational_case',
      related_entity_id:    sc.case_id,
      workspace_id:         workspaceId,
      metadata:             { stalled_hours: sc.stalled_hours, case_status: sc.case_status },
    }))
  }

  // Approval bottleneck (≥3 pending on one case)
  for (const p of casePressures) {
    const pendingLinks = (linksByCaseId[p.case_id] ?? [])
      .filter(l => l.entity_type === 'approval' && approvalMap[l.entity_id]?.status === 'pending')
    if (pendingLinks.length < 3) continue
    insightRows.push(makeInsight({
      insight_key:          `bottleneck:${p.case_id}`,
      insight_type:         'bottleneck',
      severity:             pendingLinks.length >= 5 ? 'critical' : 'high',
      confidence:           95,
      area:                 'approval',
      title:                `Approval bottleneck: ${pendingLinks.length} pending on "${p.case_title}"`,
      description:          `${pendingLinks.length} approvals are simultaneously pending for this case. Downstream workflows cannot proceed until these are resolved.`,
      why_it_matters:       'Multiple simultaneous pending approvals compound queue pressure and indicate an approver or process bottleneck.',
      recommendation:       `Process the ${pendingLinks.length} pending approvals. Consider delegating if the primary approver is unavailable.`,
      source_ids:           pendingLinks.map(l => l.entity_id),
      related_case_id:      p.case_id,
      evidence:             `${pendingLinks.length} approvals in 'pending' status. IDs: ${pendingLinks.map(l => l.entity_id.slice(0, 8)).join(', ')}`,
      related_entity_type:  'approval',
      related_entity_id:    null,
      workspace_id:         workspaceId,
      metadata:             { pending_count: pendingLinks.length, case_id: p.case_id, approval_ids: pendingLinks.map(l => l.entity_id) },
    }))
  }

  // SLA risk (pending_approval cases >24h)
  for (const c of cases) {
    if (c.status !== 'pending_approval') continue
    const hoursWaiting = (now.getTime() - new Date(c.updated_at).getTime()) / 3_600_000
    if (hoursWaiting < 24) continue
    insightRows.push(makeInsight({
      insight_key:          `SLA_risk:${c.id}`,
      insight_type:         'SLA_risk',
      severity:             hoursWaiting >= 72 ? 'critical' : 'high',
      confidence:           85,
      area:                 'approval',
      title:                `SLA risk: "${c.title}" — ${Math.round(hoursWaiting)}h pending approval`,
      description:          `Case "${c.title}" has been in 'pending_approval' status for ${Math.round(hoursWaiting)}h, which may breach operational SLAs.`,
      why_it_matters:       'Cases stuck pending approval block downstream work and risk contractual SLA breaches.',
      recommendation:       'Escalate the approval. Identify the approver, set a hard deadline. If stale, consider auto-rejection and re-routing.',
      source_ids:           [c.id],
      related_case_id:      c.id,
      evidence:             `Status: pending_approval since ${new Date(c.updated_at).toLocaleString()}. Duration: ${Math.round(hoursWaiting)}h.`,
      related_entity_type:  'operational_case',
      related_entity_id:    c.id,
      workspace_id:         workspaceId,
      metadata:             { hours_waiting: Math.round(hoursWaiting) },
    }))
  }

  // Workflow degradation insights
  for (const wd of workflowDegradation) {
    insightRows.push(makeInsight({
      insight_key:          `degradation:${wd.workflow_chain_id}`,
      insight_type:         'degradation',
      severity:             wd.health_status === 'critical' ? 'critical' : 'high',
      confidence:           80,
      area:                 'workflow',
      title:                `Workflow ${wd.health_status}: "${wd.workflow_name}"`,
      description:          `Workflow "${wd.workflow_name}" is ${wd.health_status}. ${wd.reason}. ${wd.related_case_ids.length} linked case${wd.related_case_ids.length !== 1 ? 's' : ''} affected.`,
      why_it_matters:       'Degraded workflows reduce automation reliability and leave operational objects in inconsistent states.',
      recommendation:       'Inspect recent runs for this workflow. Check if external dependencies changed. Review error messages in failed runs.',
      source_ids:           [wd.workflow_chain_id],
      related_case_id:      wd.related_case_ids[0] ?? null,
      evidence:             `${wd.reason}. Failures: ${wd.failure_count}, stalls: ${wd.stall_count}. Chain ID: ${wd.workflow_chain_id.slice(0, 8)}…`,
      related_entity_type:  'workflow_chain_run',
      related_entity_id:    wd.workflow_chain_id,
      workspace_id:         workspaceId,
      metadata:             { workflow_chain_id: wd.workflow_chain_id, failure_count: wd.failure_count, stall_count: wd.stall_count, related_cases: wd.related_case_ids },
    }))
  }

  // ── 8. Persist insights (skip dismissed ones) ─────────────────────────────
  let insightsUpserted = 0

  if (insightRows.length > 0) {
    const keys = insightRows.map(r => r.insight_key)
    const { data: existingRaw } = await db
      .from('operational_insights')
      .select('insight_key, status')
      .in('insight_key', keys)
    const dismissedKeys = new Set(
      ((existingRaw ?? []) as InsightKeyRow[])
        .filter(r => r.status === 'dismissed')
        .map(r => r.insight_key),
    )

    const toUpsert = insightRows.filter(r => !dismissedKeys.has(r.insight_key))

    for (let i = 0; i < toUpsert.length; i += 25) {
      const batch = toUpsert.slice(i, i + 25)
      const { error } = await db
        .from('operational_insights')
        .upsert(batch, { onConflict: 'insight_key' })
      if (!error) insightsUpserted += batch.length
    }
  }

  // ── 9. Update case pressure scores ───────────────────────────────────────
  for (const p of casePressures) {
    await db.from('operational_cases').update({
      pressure_score:       p.pressure_score,
      pressure_level:       p.pressure_level,
      pressure_reason:      p.pressure_reason,
      last_pressure_update: now.toISOString(),
    }).eq('id', p.case_id)
  }

  // ── 10. Build hotspots ────────────────────────────────────────────────────
  const hotspots: Hotspot[] = [
    ...casePressures
      .filter(p => p.pressure_level === 'critical' || p.pressure_level === 'elevated')
      .slice(0, 5)
      .map(p => ({ entity: p.case_title, issue: p.pressure_reason, severity: p.pressure_level })),
    ...workflowDegradation
      .slice(0, 3)
      .map(wd => ({ entity: wd.workflow_name, issue: wd.reason, severity: wd.health_status })),
  ]

  await logAction({
    action_type: 'intelligence_engine_run',
    entity_type: 'system',
    entity_id:   'intelligence',
    summary:     `Intelligence engine: ${cases.length} cases analysed, ${stalledCases.length} stalled, ${workflowDegradation.length} degraded workflows, ${insightsUpserted} insights upserted`,
    output:      { cases: cases.length, stalled: stalledCases.length, degraded: workflowDegradation.length, insights: insightsUpserted },
    status:      'completed',
  })

  return {
    generated_at:         now.toISOString(),
    duration_ms:          Date.now() - start,
    cases_analyzed:       cases.length,
    case_pressures:       casePressures.sort((a, b) => b.pressure_score - a.pressure_score),
    stalled_cases:        stalledCases.sort((a, b) => b.stalled_hours - a.stalled_hours),
    workflow_degradation: workflowDegradation,
    insights_upserted:    insightsUpserted,
    hotspots,
  }
}

// ── Fetch active insights for a specific case ─────────────────────────────────

export async function getCaseInsights(caseId: string) {
  const db = getAdmin()
  const { data } = await db
    .from('operational_insights')
    .select('id, insight_type, severity, title, description, why_it_matters, recommendation, evidence, confidence, created_at, metadata')
    .eq('related_case_id', caseId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20)
  return (data ?? []) as Array<{
    id: string; insight_type: string; severity: string; title: string
    description: string; why_it_matters: string; recommendation: string
    evidence: string | null; confidence: number; created_at: string
    metadata: Record<string, unknown>
  }>
}
