import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function chunkText(text: string, targetSize = 800): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const next = current ? current + '\n\n' + para : para
    if (next.length > targetSize && current) {
      chunks.push(current.trim())
      current = para
    } else {
      current = next
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(c => c.length > 10)
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectId = (formData.get('project_id') as string | null) || null

    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const fileName = file.name
    const fileType = fileName.split('.').pop()?.toLowerCase() ?? 'txt'

    if (!['txt', 'md'].includes(fileType)) {
      return NextResponse.json({ error: 'Only .txt and .md files are supported' }, { status: 400 })
    }

    const text = await file.text()
    if (!text.trim()) return NextResponse.json({ error: 'File is empty' }, { status: 400 })

    const db = getAdmin()

    // Insert document record
    const { data: doc, error: docErr } = await db
      .from('documents')
      .insert({
        project_id: projectId,
        file_name: fileName,
        file_type: fileType,
        file_size_bytes: file.size,
        extracted_text: text,
      })
      .select()
      .single()

    if (docErr) throw docErr

    // Chunk and store
    const chunks = chunkText(text)
    if (chunks.length > 0) {
      await db.from('document_chunks').insert(
        chunks.map((chunk_text, i) => ({
          document_id: doc.id,
          project_id: projectId,
          chunk_index: i,
          chunk_text,
          metadata: { file_name: fileName, total_chunks: chunks.length },
        }))
      )
    }

    // AI summary
    const summaryRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Summarize this document in 4-5 concise bullet points. Be specific.\n\nFile: ${fileName}\n\n${text.slice(0, 4000)}`,
      }],
    })
    const summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : null

    // Update document with summary
    await db.from('documents').update({ summary }).eq('id', doc.id)

    // Create approval for review
    await db.from('approvals').insert({
      approval_type: 'document_summary',
      title: `Review summary: ${fileName}`,
      description: summary?.slice(0, 300) ?? null,
      payload: { document_id: doc.id, file_name: fileName, chunk_count: chunks.length },
      project_id: projectId,
      entity_type: 'document',
      entity_id: doc.id,
    })

    await logAction({
      action_type: 'document_upload',
      entity_type: 'document',
      entity_id: doc.id,
      project_id: projectId,
      summary: `Uploaded ${fileName} — ${chunks.length} chunks, summary generated`,
      status: 'completed',
      duration_ms: Date.now() - start,
    })

    return NextResponse.json({ document: { ...doc, summary } })
  } catch (err) {
    console.error('[/api/documents/upload]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
