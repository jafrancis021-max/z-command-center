import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAdmin } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { memory_id } = await req.json() as { memory_id: string }
    if (!memory_id) return NextResponse.json({ error: 'memory_id required' }, { status: 400 })

    const db = getAdmin()
    const { data: memory, error: memErr } = await db
      .from('project_memories')
      .select('id, title, source_type, raw_text')
      .eq('id', memory_id)
      .single()

    if (memErr || !memory) return NextResponse.json({ error: 'Memory not found' }, { status: 404 })

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Summarize this document in 4-5 concise bullet points. Be specific and actionable.\n\nTitle: ${memory.title}\nSource: ${memory.source_type}\n\n${memory.raw_text.slice(0, 4000)}`,
      }],
    })

    const summary = res.content[0].type === 'text' ? res.content[0].text : null
    await db.from('project_memories').update({ summary }).eq('id', memory_id)

    return NextResponse.json({ summary })
  } catch (err) {
    console.error('[/api/memory/summarize]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Summarize failed' },
      { status: 500 }
    )
  }
}
