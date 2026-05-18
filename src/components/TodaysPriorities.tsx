'use client'

import { useState } from 'react'

interface Props {
  projectIds?: string[]
}

const HEALTH_COLORS: Record<string, string> = {
  STRONG: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
  ACTIVE: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  STALLED: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  AT_RISK: 'text-red-400 bg-red-500/10 border-red-500/20',
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
    <div className="space-y-4">
      {/* Health row */}
      {healthLoaded && health.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {health.map(h => (
            <div key={h.project_id} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${HEALTH_COLORS[h.status] ?? HEALTH_COLORS.ACTIVE}`}>
              <span className="font-semibold">{h.project_name}</span>
              <span className="opacity-70">—</span>
              <span className="font-mono font-bold">{h.status}</span>
              <span className="opacity-50">({h.score})</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA card */}
      {!priorities && !loading && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#e5e5e5] mb-1">Operational Intelligence</h3>
            <p className="text-xs text-[#525252]">Z analyzes all blockers, tasks, risks, and session history to generate today&apos;s priorities.</p>
          </div>
          <button
            onClick={handleGenerate}
            className="shrink-0 text-xs bg-[#f59e0b] text-black font-semibold px-4 py-2.5 rounded-lg hover:bg-[#d97706] transition-colors ml-4"
          >
            What should I focus on today?
          </button>
        </div>
      )}

      {loading && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 flex items-center gap-4">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-[#f59e0b]/60 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-xs text-[#737373]">Analyzing operational state across all projects…</p>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          ⚠️ {error}
        </div>
      )}

      {priorities && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              <span className="text-xs font-semibold text-[#f59e0b]">TODAY&apos;S PRIORITIES</span>
              {generatedAt && (
                <span className="text-[10px] text-[#525252]">
                  {new Date(generatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(priorities)}
                className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                onClick={() => setPriorities(null)}
                className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="p-4 overflow-y-auto max-h-[520px]">
            <div className="prose prose-invert prose-xs max-w-none">
              {priorities.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return (
                    <h3 key={i} className="text-xs font-semibold text-[#f59e0b] uppercase tracking-wider mt-4 mb-2 first:mt-0">
                      {line.slice(3)}
                    </h3>
                  )
                }
                if (line.startsWith('```')) return null
                if (line.startsWith('- ') || line.match(/^\d+\. /)) {
                  return (
                    <p key={i} className="text-xs text-[#a3a3a3] leading-relaxed pl-2 border-l border-[#2a2a2a] mb-1.5">
                      {line.replace(/^[-\d+\.\s]+/, '')}
                    </p>
                  )
                }
                if (line.trim() === '') return <div key={i} className="h-1" />
                return <p key={i} className="text-xs text-[#737373] leading-relaxed mb-1">{line}</p>
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
