import { after } from 'next/server'
import { NextResponse } from 'next/server'
import { getAdmin, logAction } from '@/lib/supabase-server'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { processIntake } from '@/lib/intake-processor'
import { createOperationalEvent } from '@/lib/operational-events'

export const dynamic = 'force-dynamic'

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 120)
}

export async function POST(request: Request) {
  const db          = getAdmin()
  const workspaceId = await getCurrentWorkspaceId()

  let formData: FormData
  try { formData = await request.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file   = formData.get('file') as File | null
  const caseId = formData.get('case_id') as string | null

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > 52_428_800) {
    return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 413 })
  }

  const processed     = processIntake(file.name, file.type, file.size)
  const safeFilename  = sanitizeFilename(file.name)
  const timestamp     = Date.now()
  const wsSegment     = workspaceId ?? 'default'
  const storagePath   = `${wsSegment}/${timestamp}-${safeFilename}`

  // Upload to Supabase Storage
  const fileBuffer = new Uint8Array(await file.arrayBuffer())
  const { data: storageData, error: storageError } = await db.storage
    .from('intake')
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert:      false,
    })

  if (storageError) {
    return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 })
  }

  // Persist intake_document record
  const { data, error } = await db.from('intake_documents').insert({
    original_name:      file.name,
    filename:           safeFilename,
    file_type:          processed.file_type,
    mime_type:          file.type || null,
    file_size:          file.size,
    storage_path:       storageData?.path ?? storagePath,
    storage_bucket:     'intake',
    source:             'upload',
    status:             'processed',
    extracted_summary:  processed.extracted_summary,
    detected_category:  processed.detected_category,
    suggested_workflow: processed.suggested_workflow,
    case_id:            caseId ?? null,
    workspace_id:       workspaceId,
    uploaded_by:        'operator',
    metadata:           { original_size: file.size, storage_path: storageData?.path ?? storagePath },
  }).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const docId = (data as { id: string }).id

  // Auto-create case if none provided
  let resolvedCaseId = caseId
  if (!resolvedCaseId && data) {
    const { data: newCase } = await db.from('operational_cases').insert({
      title:       file.name.replace(/\.[^.]+$/, ''),
      type:        processed.case_type,
      status:      'open',
      priority:    'medium',
      source:      'intake',
      workspace_id: workspaceId,
      metadata:    { auto_created: true, intake_id: docId },
    }).select('id').single()

    if (newCase) {
      resolvedCaseId = (newCase as { id: string }).id
      await db.from('intake_documents').update({ case_id: resolvedCaseId }).eq('id', docId)
    }
  }

  // Link document to case
  if (resolvedCaseId) {
    try {
      await db.from('case_links').insert({
        case_id:     resolvedCaseId,
        entity_type: 'intake_document',
        entity_id:   docId,
        link_type:   'attachment',
      })
    } catch { /* non-fatal */ }
  }

  await logAction({
    action_type: 'intake_upload',
    entity_type: 'intake_document',
    entity_id:   docId,
    summary:     `Uploaded: "${file.name}" (${processed.file_type}, ${processed.detected_category})`,
    output:      { category: processed.detected_category, workflow: processed.suggested_workflow, case_id: resolvedCaseId },
    status:      'completed',
  })

  after(() => createOperationalEvent({
    workspace_id:     workspaceId,
    event_type:       'vault.document_uploaded',
    event_source:     'intake',
    entity_type:      'intake_document',
    entity_id:        docId,
    title:            `Document uploaded: "${file.name}"`,
    description:      `Category: ${processed.detected_category}. Type: ${processed.file_type}.`,
    metadata:         { category: processed.detected_category, file_type: processed.file_type, case_id: resolvedCaseId },
    importance_score: 0.7,
    memory_mode:      'episodic',
    temperature_tier: 'hot',
  }))

  return NextResponse.json({ ...data, case_id: resolvedCaseId }, { status: 201 })
}
