'use client'

import { useState, useCallback } from 'react'

interface SearchResult {
  id: string
  type: string
  title: string
  summary?: string
  href: string
}

function typeIcon(type: string) {
  const map: Record<string, string> = {
    case: '📋', document: '📄', note: '📝', insight: '💡', workflow: '⚡', event: '📅',
  }
  return map[type] ?? '🔍'
}

export default function SearchPage() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults(await res.json() as SearchResult[])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    void search(v)
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13 13l4 4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 leading-none">Search</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Search across cases, vault, workflows, and more</p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative mb-6">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13 13l4 4" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={handleChange}
            placeholder="Search your operation…"
            className="w-full bg-white border border-gray-200 rounded-2xl pl-11 pr-4 py-3.5 text-[13px] text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all"
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <div className="space-y-2">
            {results.map(r => (
              <a
                key={r.id}
                href={r.href}
                className="block bg-white border border-gray-200 rounded-xl p-3.5 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="text-[18px] shrink-0">{typeIcon(r.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[11.5px] font-semibold text-gray-800 truncate">{r.title}</p>
                      <span className="text-[8.5px] font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded leading-none shrink-0 capitalize">
                        {r.type}
                      </span>
                    </div>
                    {r.summary && <p className="text-[10px] text-gray-400 line-clamp-2">{r.summary}</p>}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : query && !loading ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-[13px] font-semibold text-gray-700 mb-1">No results for &ldquo;{query}&rdquo;</p>
            <p className="text-[11px] text-gray-400">Try a different term or check the Vault, Cases, or Timeline</p>
          </div>
        ) : !query ? (
          <div className="space-y-2">
            {[
              { label: 'Cases', href: '/cases', hint: 'Open, in-progress, and pending cases' },
              { label: 'Vault', href: '/vault', hint: 'Documents, screenshots, and notes' },
              { label: 'Timeline', href: '/timeline', hint: 'Operational event history' },
              { label: 'Intelligence', href: '/insights', hint: 'Insights and recommendations' },
            ].map(s => (
              <a
                key={s.href}
                href={s.href}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 hover:bg-gray-50 transition-all"
              >
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-gray-700">{s.label}</p>
                  <p className="text-[10px] text-gray-400">{s.hint}</p>
                </div>
                <svg className="w-3.5 h-3.5 text-gray-300" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
