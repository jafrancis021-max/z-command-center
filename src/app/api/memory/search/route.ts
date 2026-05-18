import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('project_id')
    const q = searchParams.get('q')?.trim() ?? ''

    if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 })

    const db = getAdmin()

    if (!q) {
      // List all memories for project
      const { data, error } = await db
        .from('project_memories')
        .select('id, project_id, title, source_type, summary, ingestion_status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return NextResponse.json({ memories: data ?? [], query: '' })
    }

    // Search chunks with ilike, then join back to memories
    const { data: chunks, error: chunkErr } = await db
      .from('memory_chunks')
      .select('memory_id, chunk_text, chunk_index')
      .eq('project_id', projectId)
      .ilike('chunk_text', `%${q}%`)
      .limit(30)

    if (chunkErr) throw chunkErr

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ memories: [], query: q })
    }

    // Deduplicate memory_ids
    const memoryIds = [...new Set(chunks.map(c => c.memory_id))]

    const { data: memories, error: memErr } = await db
      .from('project_memories')
      .select('id, project_id, title, source_type, summary, ingestion_status, created_at')
      .in('id', memoryIds)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (memErr) throw memErr

    // Attach matching snippet to each memory
    const snippetMap = new Map<string, string>()
    for (const chunk of chunks) {
      if (!snippetMap.has(chunk.memory_id)) {
        const idx = chunk.chunk_text.toLowerCase().indexOf(q.toLowerCase())
        const start = Math.max(0, idx - 60)
        snippetMap.set(
          chunk.memory_id,
          '…' + chunk.chunk_text.slice(start, start + 200) + '…'
        )
      }
    }

    const result = (memories ?? []).map(m => ({
      ...m,
      match_snippet: snippetMap.get(m.id) ?? null,
    }))

    return NextResponse.json({ memories: result, query: q })
  } catch (err) {
    console.error('[/api/memory/search]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
