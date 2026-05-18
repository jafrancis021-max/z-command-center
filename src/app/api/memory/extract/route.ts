import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin } from '@/lib/supabase-server'
import type { ExtractionType } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { memory_id } = await req.json() as { memory_id: string }
    if (!memory_id) return NextResponse.json({ error: 'memory_id required' }, { status: 400 })

    const db = getAdmin()
    const { data: memory, error: memErr } = await db
      .from('project_memories')
      .select('id, project_id, title, raw_text')
      .eq('id', memory_id)
      .single()

    if (memErr || !memory) return NextResponse.json({ error: 'Memory not found' }, { status: 404 })

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract key information from this document as a JSON array. Return ONLY valid JSON, no other text.

Each item must have: {"type": "decision|blocker|next_step|architecture_rule|warning|milestone", "content": "...", "confidence": 0.0-1.0}

Limit to the 8 most important extractions. confidence = certainty this is a genuine extraction from the source.

Title: ${memory.title}

Document:
${memory.raw_text.slice(0, 6000)}`,
      }],
    })

    const raw = res.content[0].type === 'text' ? res.content[0].text.trim() : '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const parsed: unknown = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    if (!Array.isArray(parsed)) return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 })

    const allowedTypes = new Set(['decision','blocker','next_step','architecture_rule','warning','milestone'])
    const valid = parsed.filter((item: unknown) =>
      item && typeof item === 'object' &&
      'type' in item && typeof (item as Record<string, unknown>).type === 'string' &&
      allowedTypes.has((item as Record<string, unknown>).type as string) &&
      'content' in item && typeof (item as Record<string, unknown>).content === 'string'
    )

    // Delete old extractions and re-insert
    await db.from('memory_extractions').delete().eq('memory_id', memory_id)

    if (valid.length > 0) {
      await db.from('memory_extractions').insert(
        valid.map((e: unknown) => {
          const item = e as Record<string, unknown>
          return {
            memory_id,
            project_id: memory.project_id,
            extraction_type: item.type as ExtractionType,
            content: item.content as string,
            confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.8))),
          }
        })
      )
    }

    return NextResponse.json({ extraction_count: valid.length })
  } catch (err) {
    console.error('[/api/memory/extract]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraction failed' },
      { status: 500 }
    )
  }
}
