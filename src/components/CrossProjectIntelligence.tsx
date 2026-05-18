'use client'

import { useState } from 'react'

interface Observation {
  type: 'pattern' | 'blocker' | 'opportunity' | 'warning'
  title: string
  body: string
  projects: string[]
}

export default function CrossProjectIntelligence() {
  const [loading, setLoading] = useState(false)
  const [observations, setObservations] = useState<Observation[] | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/intelligence/cross', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setObservations(data.observations ?? null)
      setRaw(data.raw ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const TYPE_COLORS: Record<string, string> = {
    pattern:     'text-blue-400 bg-blue-500/10 border-blue-500/20',
    blocker:     'text-red-400 bg-red-500/10 border-red-500/20',
    opportunity: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
    warning:     'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  }

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div>
          <h3 className="text-xs font-semibold text-[#e5e5e5]">Cross-Project Intelligence</h3>
          <p className="text-[10px] text-[#525252] mt-0.5">Patterns, shared blockers, and knowledge transfer opportunities</p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      <div className="p-4">
        {!observations && !loading && !error && (
          <p className="text-xs text-[#525252] text-center py-4">
            Z will compare all projects to surface shared patterns, repeated blockers, and cross-project opportunities.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-4">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="text-xs text-[#737373]">Comparing project state across all workspaces…</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 py-2">⚠️ {error}</p>
        )}

        {observations && observations.length > 0 && (
          <div className="space-y-3">
            {observations.map((obs, i) => (
              <div key={i} className="border border-[#1e1e1e] rounded-lg p-3">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${TYPE_COLORS[obs.type] ?? TYPE_COLORS.pattern}`}>
                    {obs.type.toUpperCase()}
                  </span>
                  <p className="text-xs font-medium text-[#e5e5e5]">{obs.title}</p>
                </div>
                <p className="text-xs text-[#737373] leading-relaxed">{obs.body}</p>
                {obs.projects.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {obs.projects.map((p, j) => (
                      <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#525252]">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {raw && (!observations || observations.length === 0) && (
          <div className="text-xs text-[#737373] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
            {raw}
          </div>
        )}
      </div>
    </div>
  )
}
