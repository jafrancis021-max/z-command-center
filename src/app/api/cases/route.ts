import { NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

// GET — list cases with document counts
export async function GET(request: Request) {
  const db          = getAdmin()
  const url         = new URL(request.url)
  const status      = url.searchParams.get('status')
  const type        = url.searchParams.get('type')
  const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
  const workspaceId = await getCurrentWorkspaceId()

  let q = db
    .from('operational_cases')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  if (status)      q = q.eq('status', status)
  if (type)        q = q.eq('type', type)

  const { data: cases, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!cases || cases.length === 0) return NextResponse.json([])

  // Enrich with document counts (per-case queries, N is typically small)
  const caseIds  = (cases as Array<{ id: string }>).map(c => c.id)
  const countMap: Record<string, number> = {}
  for (const id of caseIds) {
    const { count } = await db
      .from('intake_documents')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', id)
    countMap[id] = count ?? 0
  }

  const enriched = (cases as Array<Record<string, unknown>>).map(c => ({
    ...c,
    document_count: countMap[c.id as string] ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST — create a case
export async function POST(request: Request) {
  const db          = getAdmin()
  const workspaceId = await getCurrentWorkspaceId()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { title, type, priority, source, description, assigned_to, reference_number } = body as {
    title?: string; type?: string; priority?: string; source?: string;
    description?: string; assigned_to?: string; reference_number?: string
  }

  if (!title || String(title).trim().length === 0) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const { data, error } = await db.from('operational_cases').insert({
    title:            String(title).trim(),
    type:             type ?? 'general',
    priority:         priority ?? 'medium',
    source:           source ?? 'manual',
    description:      description ?? null,
    assigned_to:      assigned_to ?? null,
    reference_number: reference_number ?? null,
    workspace_id:     workspaceId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAction({
    action_type: 'case_created',
    entity_type: 'operational_case',
    entity_id:   (data as { id: string }).id,
    summary:     `Case created: "${title}"`,
    output:      { type, priority, source },
    status:      'completed',
  })

  return NextResponse.json(data, { status: 201 })
}
