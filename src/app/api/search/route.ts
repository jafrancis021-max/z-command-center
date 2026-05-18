import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/supabase-server'
import type { SearchResult } from '@/types'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const pid = searchParams.get('project_id') ?? null

    if (!q || q.length < 2) return NextResponse.json({ results: [], query: q })

    const db = getAdmin()
    const like = `%${q}%`

    const [projects, notes, blockers, handovers, prompts, archRules, memories, decisions, sessions, timeline] = await Promise.all([
      db.from('projects').select('id, name').neq('status', 'archived'),

      pid
        ? db.from('notes').select('id, project_id, note, created_at').eq('project_id', pid).ilike('note', like).limit(10)
        : db.from('notes').select('id, project_id, note, created_at').ilike('note', like).limit(10),

      pid
        ? db.from('blockers').select('id, project_id, title, description, created_at').eq('project_id', pid).or(`title.ilike.${like},description.ilike.${like}`).limit(10)
        : db.from('blockers').select('id, project_id, title, description, created_at').or(`title.ilike.${like},description.ilike.${like}`).limit(10),

      pid
        ? db.from('handovers').select('id, project_id, content, created_at').eq('project_id', pid).ilike('content', like).limit(8)
        : db.from('handovers').select('id, project_id, content, created_at').ilike('content', like).limit(8),

      pid
        ? db.from('prompts').select('id, project_id, content, prompt_type, created_at').eq('project_id', pid).ilike('content', like).limit(8)
        : db.from('prompts').select('id, project_id, content, prompt_type, created_at').ilike('content', like).limit(8),

      pid
        ? db.from('architecture_rules').select('id, project_id, rule, category, created_at').eq('project_id', pid).ilike('rule', like).limit(8)
        : db.from('architecture_rules').select('id, project_id, rule, category, created_at').ilike('rule', like).limit(8),

      pid
        ? db.from('project_memories').select('id, project_id, title, summary, created_at').eq('project_id', pid).or(`title.ilike.${like},summary.ilike.${like}`).limit(8)
        : db.from('project_memories').select('id, project_id, title, summary, created_at').or(`title.ilike.${like},summary.ilike.${like}`).limit(8),

      pid
        ? db.from('decisions').select('id, project_id, decision, created_at').eq('project_id', pid).ilike('decision', like).limit(10)
        : db.from('decisions').select('id, project_id, decision, created_at').ilike('decision', like).limit(10),

      pid
        ? db.from('claude_sessions').select('id, project_id, prompt, status, created_at').eq('project_id', pid).ilike('prompt', like).limit(6)
        : db.from('claude_sessions').select('id, project_id, prompt, status, created_at').ilike('prompt', like).limit(6),

      pid
        ? db.from('project_timeline_events').select('id, project_id, title, description, event_type, created_at').eq('project_id', pid).or(`title.ilike.${like},description.ilike.${like}`).limit(6)
        : db.from('project_timeline_events').select('id, project_id, title, description, event_type, created_at').or(`title.ilike.${like},description.ilike.${like}`).limit(6),
    ])

    const projectMap = Object.fromEntries((projects.data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

    function snippet(text: string): string {
      if (!text) return ''
      const lower = text.toLowerCase()
      const idx = lower.indexOf(q.toLowerCase())
      if (idx === -1) return text.slice(0, 150) + '…'
      const start = Math.max(0, idx - 60)
      return (start > 0 ? '…' : '') + text.slice(start, start + 200) + (text.length > start + 200 ? '…' : '')
    }

    const results: SearchResult[] = []

    for (const n of (notes.data ?? []) as Array<{ id: string; project_id: string; note: string; created_at: string }>) {
      results.push({ id: n.id, type: 'note', project_id: n.project_id, project_name: projectMap[n.project_id], title: 'Note', snippet: snippet(n.note), created_at: n.created_at })
    }
    for (const b of (blockers.data ?? []) as Array<{ id: string; project_id: string; title: string; description: string | null; created_at: string }>) {
      results.push({ id: b.id, type: 'blocker', project_id: b.project_id, project_name: projectMap[b.project_id], title: b.title, snippet: snippet(b.description ?? b.title), created_at: b.created_at })
    }
    for (const d of (decisions.data ?? []) as Array<{ id: string; project_id: string; decision: string; created_at: string }>) {
      results.push({ id: d.id, type: 'decision', project_id: d.project_id, project_name: projectMap[d.project_id], title: 'Decision', snippet: snippet(d.decision), created_at: d.created_at })
    }
    for (const h of (handovers.data ?? []) as Array<{ id: string; project_id: string; content: string; created_at: string }>) {
      results.push({ id: h.id, type: 'handover', project_id: h.project_id, project_name: projectMap[h.project_id], title: 'Handover', snippet: snippet(h.content), created_at: h.created_at })
    }
    for (const p of (prompts.data ?? []) as Array<{ id: string; project_id: string; content: string; prompt_type: string; created_at: string }>) {
      results.push({ id: p.id, type: 'prompt', project_id: p.project_id, project_name: projectMap[p.project_id], title: `Prompt (${p.prompt_type})`, snippet: snippet(p.content), created_at: p.created_at })
    }
    for (const a of (archRules.data ?? []) as Array<{ id: string; project_id: string; rule: string; category: string; created_at: string }>) {
      results.push({ id: a.id, type: 'architecture_rule', project_id: a.project_id, project_name: projectMap[a.project_id], title: `Arch Rule (${a.category})`, snippet: snippet(a.rule), created_at: a.created_at })
    }
    for (const m of (memories.data ?? []) as Array<{ id: string; project_id: string | null; title: string; summary: string | null; created_at: string }>) {
      results.push({ id: m.id, type: 'memory', project_id: m.project_id, project_name: m.project_id ? projectMap[m.project_id] : undefined, title: m.title, snippet: snippet(m.summary ?? m.title), created_at: m.created_at })
    }
    for (const s of (sessions.data ?? []) as Array<{ id: string; project_id: string | null; prompt: string; status: string; created_at: string }>) {
      results.push({ id: s.id, type: 'session', project_id: s.project_id, project_name: s.project_id ? projectMap[s.project_id] : undefined, title: `Session [${s.status}]`, snippet: snippet(s.prompt), created_at: s.created_at })
    }
    for (const t of (timeline.data ?? []) as Array<{ id: string; project_id: string; title: string; description: string | null; event_type: string; created_at: string }>) {
      results.push({ id: t.id, type: 'timeline', project_id: t.project_id, project_name: projectMap[t.project_id], title: `${t.event_type}: ${t.title}`, snippet: snippet(t.description ?? t.title), created_at: t.created_at })
    }

    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ results: results.slice(0, 40), query: q })
  } catch (err) {
    console.error('[/api/search]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Search failed' }, { status: 500 })
  }
}
