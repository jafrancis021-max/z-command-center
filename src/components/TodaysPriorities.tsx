'use client'

import { useState } from 'react'

interface Props {
  projectIds?: string[]
}

const HEALTH_COLORS: Record<string, { pill: string; dot: string }> = {
  STRONG: { pill: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20', dot: 'bg-[#22c55e]' },
  ACTIVE: { pill: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20', dot: 'bg-[#f59e0b]' },
  STALLED: { pill: 'text-orange-400 bg-orange-500/10 border-orange-500/20', dot: 'bg-orange-400' },
  AT_RISK: { pill: 'text-red-400 bg-red-500/10 border-red-500/20', dot: 'bg-red-500' },
}

interface HealthItem {
  project_id: string
  project_name: string
  status: string
  score: number
  reasons: string[]
}

export default function TodaysPriorities({ projectIds }: Props) {
  const [loading, setLoading] = useState(false)
  const [priorities, setPriorities] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthItem[]>([])
  const [healthLoaded, setHealthLoaded] = useState(false)
  const [error, setError] = useState('')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const [prioRes, healthRes] = await Promise.all([
        fetch('/api/intelligence/today', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        fetch('/api/intelligence/health'),
      ])
      const [prioData, healthData] = await Promise.all([prioRes.json(), healthRes.json()])
      if (!prioRes.ok) throw new Error(prioData.error)
      setPriorities(prioData.priorities)
      setGeneratedAt(prioData.generated_at)
      setHealth(healthData.health ?? [])
      setHealthLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  void projectIds

  return (
    <div className="space-y-3">
      {/* Health row */}
      {healthLoaded && health.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {health.map(h => {
            const cfg = HEALTH_COLORS[h.status] ?? HEALTH_COLORS.ACTIVE
            return (
              <div key={h.project_id} className={`flex items-center gap-2 text-xs px-2.5 py-1 rounded-lg border ${cfg.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className="font-semibold">{h.project_name}</span>
                <span className="opacity-40">·</span>
                <span className="font-mono text-[10px] font-bold opacity-80">{h.status}</span>
                <span className="text-[10px] opacity-40 tabular-nums">{h.score}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* CTA card */}
      {!priorities && !loading && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex items-center justify-between gap-4 hover:border-[#252525] transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/[0.09] border border-blue-500/20 flex items-center justify-center shrink-0">
              <svg className="w-[15px] h-[15px] text-blue-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="10" cy="10" r="7.5" />
                <circle cx="10" cy="10" r="3" />
                <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-[12.5px] font-semibold text-[#dcdcdc] leading-none mb-1">Operational Intelligence</h3>
              <p className="text-[9.5px] text-[#a0a0a0] leading-relaxed">Z analyzes all blockers, tasks, risks, and session history to surface today&apos;s priorities.</p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            className="shrink-0 text-[10px] font-medium bg-[#111] border border-[#252525] text-[#a0a0a0] px-3.5 py-2 rounded-xl hover:border-[#444] hover:text-[#d0d0d0] transition-colors whitespace-nowrap"
          >
            What should I focus on?
          </button>
        </div>
      )}

      {loading && (
        <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-2xl px-5 py-4 flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-blue-500/[0.09] border border-blue-500/20 flex items-center justify-center shrink-0">
            <div className="flex gap-0.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-blue-400/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#c0c0c0]">Analyzing operational state</p>
            <p className="text-[9.5px] text-[#7a7a7a] mt-0.5">Scanning blockers, tasks, risks, and session history…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {priorities && (
        <div className="bg-[#0c0c0c] border border-[#1c1c1c] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#181818] bg-[#0a0a0a]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse shrink-0" />
              <span className="text-[10px] font-semibold text-[#f59e0b] uppercase tracking-[0.1em]">Today&apos;s Priorities</span>
              {generatedAt && (
                <span className="text-[10px] text-[#6a6a6a] tabular-nums font-mono">
                  {new Date(generatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(priorities)}
                className="text-[10px] text-[#666] hover:text-[#c0c0c0] transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="text-[10px] text-[#666] hover:text-[#c0c0c0] transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                onClick={() => setPriorities(null)}
                className="text-[10px] text-[#666] hover:text-[#c0c0c0] transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="p-4 overflow-y-auto max-h-[520px]">
            <div className="space-y-0.5">
              {priorities.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return (
                    <h3 key={i} className="text-[10px] font-semibold text-[#f59e0b] uppercase tracking-widest mt-5 mb-2 first:mt-0">
                      {line.slice(3)}
                    </h3>
                  )
                }
                if (line.startsWith('```')) return null
                if (line.startsWith('- ') || line.match(/^\d+\. /)) {
                  return (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="w-1 h-1 rounded-full bg-[#2a2a2a] shrink-0 mt-1.5" />
                      <p className="text-xs text-[#a3a3a3] leading-relaxed">
                        {line.replace(/^[-\d+.\s]+/, '')}
                      </p>
                    </div>
                  )
                }
                if (line.trim() === '') return <div key={i} className="h-1.5" />
                return <p key={i} className="text-xs text-[#737373] leading-relaxed">{line}</p>
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
