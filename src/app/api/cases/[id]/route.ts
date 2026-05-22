import { NextRequest, NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { getCaseInsights } from '@/lib/operational-intelligence-engine'

export const dynamic = 'force-dynamic'

const ENTITY_TABLE: Record<string, string> = {
  intake_document:              'intake_documents',
  email:                        'emails',
  approval:                     'approvals',
  inbox_workflow_suggestion:    'inbox_workflow_suggestions',
  workflow_chain_run:           'workflow_chain_runs',
  notification:                 'notifications',
  browser_execution_run:        'browser_execution_runs',
}

type LinkRow = { id: string; entity_type: string; entity_id: string; link_type: string; notes: string | null; created_at: string }
type EnrichedLink = LinkRow & { entity_data: Record<string, unknown> | null }

// GET — case detail with enriched linked entities
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db     = getAdmin()

  const [caseRes, docsRes, linksRes, logsRes, insightsData] = await Promise.all([
    db.from('operational_cases').select('*').eq('id', id).single(),
    db.from('intake_documents').select('*').eq('case_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('case_links').select('*').eq('case_id', id).order('created_at', { ascending: false }).limit(100),
    db.from('action_logs').select('id, action_type, summary, status, created_at, duration_ms').eq('entity_id', id).order('created_at', { ascending: false }).limit(30),
    getCaseInsights(id),
  ])

  if (caseRes.error || !caseRes.data) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 })
  }

  const rawLinks = (linksRes.data ?? []) as LinkRow[]

  // Batch-fetch entity data grouped by entity_type
  const byType = rawLinks.reduce<Record<string, string[]>>((acc, l) => {
    const t = l.entity_type
    if (!acc[t]) acc[t] = []
    acc[t].push(l.entity_id)
    return acc
  }, {})

  const entityMaps: Record<string, Map<string, Record<string, unknown>>> = {}

  await Promise.allSettled(
    Object.entries(byType).map(async ([type, ids]) => {
      const table = ENTITY_TABLE[type]
      if (!table) return
      const { data } = await db.from(table).select('*').in('id', ids)
      const m = new Map<string, Record<string, unknown>>()
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        if (typeof row['id'] === 'string') m.set(row['id'], row)
      }
      entityMaps[type] = m
    })
  )

  const enrichedLinks: EnrichedLink[] = rawLinks.map(l => ({
    ...l,
    entity_data: entityMaps[l.entity_type]?.get(l.entity_id) ?? null,
  }))

  const linked_counts: Record<string, number> = {}
  for (const [type, ids] of Object.entries(byType)) {
    linked_counts[type] = ids.length
  }

  return NextResponse.json({
    case:          caseRes.data,
    documents:     docsRes.data ?? [],
    links:         enrichedLinks,
    linked_counts,
    audit:         logsRes.data ?? [],
    insights:      insightsData,
  })
}

// PATCH — update case status / fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db     = getAdmin()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const allowed = ['title', 'status', 'priority', 'type', 'description', 'assigned_to', 'reference_number', 'timeline_summary']
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (updates.status === 'closed' || updates.status === 'resolved') {
    updates.closed_at = new Date().toISOString()
  }

  const { data, error } = await db
    .from('operational_cases')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAction({
    action_type: 'case_updated',
    entity_type: 'operational_case',
    entity_id:   id,
    summary:     `Case updated: ${Object.keys(updates).join(', ')}`,
    output:      updates,
    status:      'completed',
  })

  return NextResponse.json(data)
}
