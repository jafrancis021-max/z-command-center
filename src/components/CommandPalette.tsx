'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { SearchResult } from '@/types'

// ── Search icon ───────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6.5" cy="6.5" r="4" />
      <path d="M10 10l3 3" strokeLinecap="round" />
    </svg>
  )
}

// ── Nav shortcuts ─────────────────────────────────────────────────────────────

const NAV_ACTIONS = [
  { id: 'nav-dashboard',    label: 'Dashboard',       sub: 'Operational overview',      href: '/dashboard',         icon: '⬡' },
  { id: 'nav-timeline',     label: 'Timeline',        sub: 'Unified operational history', href: '/timeline',         icon: '◐' },
  { id: 'nav-inbox',        label: 'Inbox',           sub: 'Email & alerts',             href: '/inbox',             icon: '◻' },
  { id: 'nav-workflows',    label: 'Workflows',       sub: 'Automation runs',            href: '/workflows',         icon: '⟳' },
  { id: 'nav-approvals',    label: 'Approvals',       sub: 'Pending decisions',          href: '/approvals',         icon: '◈' },
  { id: 'nav-memory',       label: 'Memory',          sub: 'Operational intelligence',   href: '/memory',            icon: '◉' },
  { id: 'nav-browser',      label: 'Browser Sandbox', sub: 'Execution replay',           href: '/browser-execution', icon: '▣' },
  { id: 'nav-email-triage', label: 'Email Triage',    sub: 'AI classification',          href: '/email-triage',      icon: '·' },
  { id: 'nav-drafts',       label: 'Drafts',          sub: 'Draft responses',            href: '/drafts',            icon: '·' },
  { id: 'nav-canary',       label: 'Canary',          sub: 'Sports intelligence',        href: '/canary',            icon: '·' },
]

const TYPE_ICON: Record<string, string> = {
  memory:            '◉',
  note:              '·',
  blocker:           '⚠',
  handover:          '⟲',
  prompt:            '·',
  architecture_rule: '⬡',
  timeline:          '◐',
  session:           '▷',
  decision:          '◈',
}

const TYPE_COLOR: Record<string, string> = {
  memory:            'text-violet-400',
  note:              'text-[#555]',
  blocker:           'text-red-400',
  handover:          'text-blue-400',
  prompt:            'text-[#555]',
  architecture_rule: 'text-violet-400',
  timeline:          'text-blue-400',
  session:           'text-[#22c55e]',
  decision:          'text-[#f59e0b]',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<SearchResult[]>([])
  const [loading, setLoading]         = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelectedIdx(0)
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (query.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const d: { results: SearchResult[] } = await r.json()
        setResults(d.results ?? [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 160)
    return () => clearTimeout(t)
  }, [query])

  // Reset selection on query change
  useEffect(() => { setSelectedIdx(0) }, [query])

  const items: (typeof NAV_ACTIONS[number] | SearchResult)[] =
    query.length < 2 ? NAV_ACTIONS : results

  const go = useCallback((item: typeof NAV_ACTIONS[number] | SearchResult) => {
    if ('href' in item) {
      router.push(item.href)
    } else {
      const r = item as SearchResult
      router.push(r.project_id ? `/dashboard?project=${r.project_id}` : '/dashboard')
    }
    setOpen(false)
  }, [router])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, items.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && items[selectedIdx]) {
      e.preventDefault()
      go(items[selectedIdx])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[13vh] px-4"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="relative w-full max-w-[580px] bg-[#0d0d0d] border border-[#222] rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.65)] animate-cmd-enter overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1a1a1a]">
          <span className="text-[#3B82F6]">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or navigate…"
            className="flex-1 bg-transparent text-[13px] text-[#d4d4d4] placeholder:text-[#2e2e2e] outline-none"
          />
          {loading && (
            <span className="inline-block w-3 h-3 rounded-full border border-[#333] border-t-[#3B82F6] animate-spin shrink-0" />
          )}
          <kbd className="text-[9px] text-[#2a2a2a] font-mono border border-[#1e1e1e] px-1.5 py-0.5 rounded shrink-0">ESC</kbd>
        </div>

        {/* Results list */}
        <div className="max-h-[390px] overflow-y-auto py-1.5">
          {query.length < 2 && (
            <p className="text-[8px] font-semibold text-[#252525] uppercase tracking-[0.12em] px-4 pt-1 pb-2">
              Navigate
            </p>
          )}

          {query.length >= 2 && results.length === 0 && !loading && (
            <p className="text-[11px] text-[#333] px-4 py-8 text-center">
              No results for &quot;{query}&quot;
            </p>
          )}

          {query.length < 2 &&
            NAV_ACTIONS.map((item, i) => (
              <button
                key={item.id}
                onClick={() => go(item)}
                className={`w-full flex items-center gap-3 px-4 py-[9px] text-left transition-colors ${
                  i === selectedIdx ? 'bg-blue-500/[0.07]' : 'hover:bg-[#111]'
                }`}
              >
                <span
                  className={`text-[11px] font-mono w-5 text-center shrink-0 ${
                    i === selectedIdx ? 'text-blue-400' : 'text-[#383838]'
                  }`}
                >
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[11px] font-medium truncate ${i === selectedIdx ? 'text-[#d4d4d4]' : 'text-[#777]'}`}>
                    {item.label}
                  </p>
                  <p className="text-[9px] text-[#2a2a2a] truncate mt-0.5">{item.sub}</p>
                </div>
                {i === selectedIdx && (
                  <span className="text-[9px] font-mono text-blue-500/50 shrink-0">↵</span>
                )}
              </button>
            ))}

          {query.length >= 2 &&
            results.map((r, i) => {
              const icon  = TYPE_ICON[r.type] ?? '·'
              const color = TYPE_COLOR[r.type] ?? 'text-[#555]'
              return (
                <button
                  key={r.id}
                  onClick={() => go(r)}
                  className={`w-full flex items-start gap-3 px-4 py-[9px] text-left transition-colors ${
                    i === selectedIdx ? 'bg-blue-500/[0.07]' : 'hover:bg-[#111]'
                  }`}
                >
                  <span
                    className={`text-[11px] font-mono w-5 text-center shrink-0 mt-0.5 ${
                      i === selectedIdx ? color : 'text-[#383838]'
                    }`}
                  >
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-[11px] font-medium truncate ${i === selectedIdx ? 'text-[#d4d4d4]' : 'text-[#777]'}`}>
                        {r.title}
                      </p>
                      {r.project_name && (
                        <span className="text-[8px] text-[#333] bg-[#141414] border border-[#1e1e1e] px-1 py-0.5 rounded shrink-0 truncate max-w-[80px]">
                          {r.project_name}
                        </span>
                      )}
                    </div>
                    <p className="text-[9.5px] text-[#3a3a3a] line-clamp-1 mt-0.5">{r.snippet}</p>
                  </div>
                  {i === selectedIdx && (
                    <span className="text-[9px] font-mono text-blue-500/50 shrink-0 mt-0.5">↵</span>
                  )}
                </button>
              )
            })}
        </div>

        {/* Footer */}
        <div className="border-t border-[#141414] px-4 py-2 flex items-center gap-4">
          <span className="text-[8.5px] text-[#252525]"><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span className="text-[8.5px] text-[#252525]"><kbd className="font-mono">↵</kbd> open</span>
          <span className="text-[8.5px] text-[#252525]"><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto text-[8.5px] text-[#252525] font-mono">⌘K</span>
        </div>
      </div>
    </div>
  )
}
