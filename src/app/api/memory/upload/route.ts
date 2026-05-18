import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin, logAction } from '@/lib/supabase-server'
import type { ExtractionType } from '@/types'

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

interface RawExtraction {
  type: string
  content: string
  confidence: number
}

async function runExtraction(text: string, title: string): Promise<RawExtraction[]> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Extract key information from this document as a JSON array. Return ONLY valid JSON, no other text.

Each item must have: {"type": "decision|blocker|next_step|architecture_rule|warning|milestone", "content": "...", "confidence": 0.0-1.0}

Limit to the 8 most important extractions. confidence = certainty this is a genuine extraction from the source.

Title: ${title}

Document:
${text.slice(0, 6000)}`,
    }],
  })
  const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : '[]'
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []
  const parsed: unknown = JSON.parse(jsonMatch[0])
  if (!Array.isArray(parsed)) return []
  const valid: RawExtraction[] = []
  const allowedTypes = new Set(['decision','blocker','next_step','architecture_rule','warning','milestone'])
  for (const item of parsed) {
    if (
      item && typeof item === 'object' &&
      'type' in item && typeof item.type === 'string' && allowedTypes.has(item.type) &&
      'content' in item && typeof item.content === 'string' && item.content.length > 0 &&
      'confidence' in item && typeof item.confidence === 'number'
    ) {
      valid.push({
        type: item.type,
        content: item.content,
        confidence: Math.min(1, Math.max(0, item.confidence)),
      })
    }
  }
  return valid
}

export async function POST(req: NextRequest) {
  const start = Date.now()
  const db = getAdmin()

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const pastedText = formData.get('text') as string | null
    const title = (formData.get('title') as string | null)?.trim()
    const sourceType = (formData.get('source_type') as string | null) ?? 'upload'
    const projectId = (formData.get('project_id') as string | null) || null

    const allowedSourceTypes = ['upload','paste','handover','transcript','architecture','log','strategy']
    if (!allowedSourceTypes.includes(sourceType)) {
      return NextResponse.json({ error: 'Invalid source_type' }, { status: 400 })
    }

    let text = ''
    let resolvedTitle = title ?? ''

    if (file) {
      const fileType = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!['txt', 'md'].includes(fileType)) {
        return NextResponse.json({ error: 'Only .txt and .md files are supported' }, { status: 400 })
      }
      text = await file.text()
      if (!resolvedTitle) resolvedTitle = file.name.replace(/\.[^.]+$/, '')
    } else if (pastedText) {
      text = pastedText
    } else {
      return NextResponse.json({ error: 'file or text required' }, { status: 400 })
    }

    if (!text.trim()) return NextResponse.json({ error: 'Content is empty' }, { status: 400 })
    if (!resolvedTitle) return NextResponse.json({ error: 'title required' }, { status: 400 })

    // Insert with processing status
    const { data: memory, error: memErr } = await db
      .from('project_memories')
      .insert({
        project_id: projectId,
        title: resolvedTitle,
        source_type: sourceType,
        raw_text: text,
        ingestion_status: 'processing',
      })
      .select()
      .single()

    if (memErr) throw memErr

    // Chunk
    const chunks = chunkText(text)
    if (chunks.length > 0) {
      await db.from('memory_chunks').insert(
        chunks.map((chunk_text, i) => ({
          memory_id: memory.id,
          project_id: projectId,
          chunk_index: i,
          chunk_text,
          metadata: { title: resolvedTitle, source_type: sourceType, total_chunks: chunks.length },
        }))
      )
    }

    // AI summary
    const summaryRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Summarize this document in 4-5 concise bullet points. Be specific and actionable.\n\nTitle: ${resolvedTitle}\nSource: ${sourceType}\n\n${text.slice(0, 4000)}`,
      }],
    })
    const summary = summaryRes.content[0].type === 'text' ? summaryRes.content[0].text : null

    // AI extraction
    let extractions: RawExtraction[] = []
    try {
      extractions = await runExtraction(text, resolvedTitle)
    } catch {
      // non-fatal — continue without extractions
    }

    // Insert extractions
    if (extractions.length > 0) {
      await db.from('memory_extractions').insert(
        extractions.map(e => ({
          memory_id: memory.id,
          project_id: projectId,
          extraction_type: e.type as ExtractionType,
          content: e.content,
          confidence: e.confidence,
        }))
      )
    }

    // Mark complete
    await db.from('project_memories')
      .update({ ingestion_status: 'complete', summary })
      .eq('id', memory.id)

    await logAction({
      action_type: 'memory_ingest',
      entity_type: 'project_memory',
      entity_id: memory.id,
      project_id: projectId,
      summary: `Ingested "${resolvedTitle}" — ${chunks.length} chunks, ${extractions.length} extractions`,
      status: 'completed',
      duration_ms: Date.now() - start,
    })

    return NextResponse.json({
      memory: { ...memory, ingestion_status: 'complete', summary },
      chunk_count: chunks.length,
      extraction_count: extractions.length,
    })
  } catch (err) {
    console.error('[/api/memory/upload]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ingestion failed' },
      { status: 500 }
    )
  }
}
