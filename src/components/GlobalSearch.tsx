'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { SearchResult } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  memory:           'text-purple-400 bg-purple-500/10 border-purple-500/20',
  note:             'text-[#737373] bg-[#737373]/10 border-[#737373]/20',
  blocker:          'text-red-400 bg-red-500/10 border-red-500/20',
  handover:         'text-blue-400 bg-blue-500/10 border-blue-500/20',
  prompt:           'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  architecture_rule:'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  timeline:         'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
  session:          'text-orange-400 bg-orange-500/10 border-orange-500/20',
  decision:         'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
}

const TYPE_LABELS: Record<string, string> = {
  memory: 'MEMORY', note: 'NOTE', blocker: 'BLOCKER', handover: 'HANDOVER',
  prompt: 'PROMPT', architecture_rule: 'ARCH', timeline: 'TIMELINE',
  session: 'SESSION', decision: 'DECISION',
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Keyboard shortcut: /
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div ref={panelRef} className="relative">
      <div
        className={`flex items-center gap-2 bg-[#111] border rounded-lg px-3 py-1.5 cursor-text transition-colors ${
          open ? 'border-[#f59e0b]/40' : 'border-[#1e1e1e] hover:border-[#2a2a2a]'
        }`}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <span className="text-[#525252] text-xs">⌕</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          placeholder="Search everything…"
          className="bg-transparent text-xs text-[#e5e5e5] placeholder-[#525252] outline-none w-40 focus:w-56 transition-all"
        />
        {loading && (
          <div className="flex gap-0.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-1 h-1 rounded-full bg-[#f59e0b]/60 animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
        {!loading && (
          <span className="text-[10px] text-[#3a3a3a] shrink-0">/</span>
        )}
      </div>

      {open && (results.length > 0 || query.length >= 2) && (
        <div className="absolute top-full right-0 mt-1 w-[480px] max-h-[480px] overflow-y-auto bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl z-50">
          {results.length === 0 && query.length >= 2 && !loading && (
            <div className="px-4 py-6 text-center text-xs text-[#525252]">
              No results for &quot;{query}&quot;
            </div>
          )}
          {results.map(r => (
            <div
              key={`${r.type}-${r.id}`}
              className="flex gap-3 px-4 py-3 hover:bg-[#1a1a1a] cursor-pointer border-b border-[#1a1a1a] last:border-0 transition-colors"
              onClick={() => setOpen(false)}
            >
              <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 h-fit mt-0.5 ${TYPE_COLORS[r.type] ?? TYPE_COLORS.note}`}>
                {TYPE_LABELS[r.type] ?? r.type.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {r.project_name && (
                    <span className="text-[10px] text-[#f59e0b] font-medium">{r.project_name}</span>
                  )}
                  <span className="text-xs text-[#a3a3a3] font-medium truncate">{r.title}</span>
                </div>
                <p className="text-[11px] text-[#525252] leading-relaxed line-clamp-2">{r.snippet}</p>
              </div>
              {r.project_id && (
                <Link
                  href={`/projects/${r.project_id}`}
                  className="shrink-0 text-[10px] text-[#3a3a3a] hover:text-[#f59e0b] transition-colors self-center"
                  onClick={e => e.stopPropagation()}
                >
                  →
                </Link>
              )}
            </div>
          ))}
          {results.length > 0 && (
            <div className="px-4 py-2 text-[10px] text-[#3a3a3a] text-right border-t border-[#1a1a1a]">
              {results.length} results · press Esc to close
            </div>
          )}
        </div>
      )}
    </div>
  )
}
