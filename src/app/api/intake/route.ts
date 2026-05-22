import { NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { processIntake } from '@/lib/intake-processor'
import { classifyOperationalMemoryItem } from '@/lib/memory-classifier'

export const dynamic = 'force-dynamic'

// GET — list recent intake documents
export async function GET(request: Request) {
  const db          = getAdmin()
  const url         = new URL(request.url)
  const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 100)
  const caseId      = url.searchParams.get('case_id')
  const workspaceId = await getCurrentWorkspaceId()

  let q = db
    .from('intake_documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (workspaceId) q = q.eq('workspace_id', workspaceId)
  if (caseId)      q = q.eq('case_id', caseId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create manual note intake
export async function POST(request: Request) {
  const db          = getAdmin()
  const workspaceId = await getCurrentWorkspaceId()

  let body: { title?: string; content?: string; category?: string; case_id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { title, content, category, case_id } = body
  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const filename   = (title ?? 'Manual note').trim()
  const processed  = processIntake(filename, null, null, content)
  const finalCategory = (category ?? processed.detected_category) as string

  const { data, error } = await db.from('intake_documents').insert({
    original_name:      filename,
    filename:           filename,
    file_type:          'note',
    source:             'manual',
    status:             'processed',
    extracted_text:     content,
    extracted_summary:  processed.extracted_summary,
    detected_category:  finalCategory,
    suggested_workflow: processed.suggested_workflow,
    case_id:            case_id ?? null,
    workspace_id:       workspaceId,
    metadata:           { manual: true },
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-link to case
  if (case_id && data) {
    try {
      await db.from('case_links').insert({
        case_id,
        entity_type: 'intake_document',
        entity_id:   (data as { id: string }).id,
        link_type:   'attachment',
      })
    } catch { /* non-fatal */ }
  }

  // Classify and persist to operational memory layer
  const classification = classifyOperationalMemoryItem(filename, content, 'manual')
  const { data: memItem } = await db.from('operational_memory_items').insert({
    workspace_id:             workspaceId,
    title:                    filename,
    content:                  content.slice(0, 4000),
    source_type:              'manual',
    memory_layer:             classification.memory_layer,
    category:                 classification.category,
    authority_level:          classification.authority_level,
    retrieval_priority:       classification.retrieval_priority,
    assistant_default_access: classification.assistant_default_access,
    linked_case_id:           case_id ?? null,
    status:                   classification.status,
    metadata:                 { intake_document_id: (data as { id: string }).id },
  }).select('id').single()

  if (memItem) {
    await db.from('classification_logs').insert({
      item_id:        (memItem as { id: string }).id,
      item_title:     filename,
      assigned_layer: classification.memory_layer,
      confidence:     0.85,
      source_type:    'manual',
    }).throwOnError().then(() => null).catch(() => null)
  }

  await logAction({
    action_type: 'intake_manual_note',
    entity_type: 'intake_document',
    entity_id:   (data as { id: string }).id,
    summary:     `Manual note: "${filename}"`,
    output:      { category: finalCategory, workflow: processed.suggested_workflow, memory_layer: classification.memory_layer },
    status:      'completed',
  })

  return NextResponse.json(data, { status: 201 })
}
