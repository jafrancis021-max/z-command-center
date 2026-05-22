'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { SearchResult } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  memory:            'text-purple-700 bg-purple-50 border-purple-200',
  note:              'text-slate-600 bg-slate-100 border-slate-200',
  blocker:           'text-red-700 bg-red-50 border-red-200',
  handover:          'text-blue-700 bg-blue-50 border-blue-200',
  prompt:            'text-amber-700 bg-amber-50 border-amber-200',
  architecture_rule: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  timeline:          'text-green-700 bg-green-50 border-green-200',
  session:           'text-orange-700 bg-orange-50 border-orange-200',
  decision:          'text-indigo-700 bg-indigo-50 border-indigo-200',
}

const TYPE_LABELS: Record<string, string> = {
  memory: 'MEMORY', note: 'NOTE', blocker: 'BLOCKER', handover: 'HANDOVER',
  prompt: 'PROMPT', architecture_rule: 'ARCH', timeline: 'TIMELINE',
  session: 'SESSION', decision: 'DECISION',
}

export default function GlobalSearch() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
  const inputRef   = useRef<HTMLInputElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

      {/* ── Search trigger / input ── */}
      <div
        className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-1.5 cursor-text shadow-sm transition-all ${
          open
            ? 'border-blue-300 ring-2 ring-blue-100'
            : 'border-slate-200 hover:border-slate-300'
        }`}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l4 4" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          placeholder="Search everything…"
          className="bg-transparent text-[11px] text-slate-900 placeholder-slate-400 outline-none w-40 focus:w-52 transition-all"
        />
        {loading ? (
          <div className="flex gap-0.5 shrink-0">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1 h-1 rounded-full bg-blue-400/60 animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 shrink-0 font-mono">/</span>
        )}
      </div>

      {/* ── Results dropdown ── */}
      {open && (results.length > 0 || query.length >= 2) && (
        <div className="absolute top-full right-0 mt-1.5 w-[480px] max-h-[480px] overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50">
          {results.length === 0 && query.length >= 2 && !loading && (
            <div className="px-4 py-6 text-center text-[11px] text-slate-400">
              No results for &quot;{query}&quot;
            </div>
          )}

          {results.map(r => (
            <div
              key={`${r.type}-${r.id}`}
              className="flex gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors"
              onClick={() => setOpen(false)}
            >
              <span className={`text-[8.5px] px-1.5 py-0.5 rounded border shrink-0 h-fit mt-0.5 font-semibold ${TYPE_COLORS[r.type] ?? TYPE_COLORS.note}`}>
                {TYPE_LABELS[r.type] ?? r.type.toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {r.project_name && (
                    <span className="text-[10px] text-blue-600 font-semibold">{r.project_name}</span>
                  )}
                  <span className="text-[11px] text-slate-700 font-medium truncate">{r.title}</span>
                </div>
                <p className="text-[10.5px] text-slate-500 leading-relaxed line-clamp-2">{r.snippet}</p>
              </div>
              {r.project_id && (
                <Link
                  href={`/projects/${r.project_id}`}
                  className="shrink-0 text-[10px] text-slate-400 hover:text-blue-600 transition-colors self-center"
                  onClick={e => e.stopPropagation()}
                >
                  →
                </Link>
              )}
            </div>
          ))}

          {results.length > 0 && (
            <div className="px-4 py-2 text-[9.5px] text-slate-400 text-right border-t border-slate-100">
              {results.length} results · press Esc to close
            </div>
          )}
        </div>
      )}
    </div>
  )
}
