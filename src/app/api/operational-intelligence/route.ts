import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { runOperationalIntelligence } from '@/lib/operational-intelligence-engine'

export const dynamic = 'force-dynamic'

// GET — run intelligence engine and return full analysis
export async function GET() {
  const workspaceId = await getCurrentWorkspaceId()

  try {
    const result = await runOperationalIntelligence(workspaceId)

    // Also fetch the current active insight list from DB (includes previously generated ones
    // not overwritten this run, e.g. from the older global insight engine)
    const db = getAdmin()
    let insightQ = db
      .from('operational_insights')
      .select('id, insight_key, insight_type, severity, confidence, area, title, description, why_it_matters, recommendation, evidence, source_ids, related_case_id, related_entity_type, related_entity_id, metadata, created_at, updated_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(100)
    if (workspaceId) insightQ = insightQ.eq('workspace_id', workspaceId)

    const { data: activeInsights } = await insightQ

    return NextResponse.json({
      ...result,
      active_insights: activeInsights ?? [],
      summary: {
        total_insights:   (activeInsights ?? []).length,
        critical:         (activeInsights ?? []).filter((i: { severity: string }) => i.severity === 'critical').length,
        high:             (activeInsights ?? []).filter((i: { severity: string }) => i.severity === 'high').length,
        medium:           (activeInsights ?? []).filter((i: { severity: string }) => i.severity === 'medium').length,
        stalled_cases:    result.stalled_cases.length,
        degraded_workflows: result.workflow_degradation.length,
        critical_cases:   result.case_pressures.filter(p => p.pressure_level === 'critical').length,
        elevated_cases:   result.case_pressures.filter(p => p.pressure_level === 'elevated').length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/operational-intelligence] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
