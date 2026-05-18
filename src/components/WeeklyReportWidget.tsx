'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WeeklyReport } from '@/types'

interface Props {
  projectId: string
  projectName: string
}

export default function WeeklyReportWidget({ projectId, projectName }: Props) {
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [generating, setGenerating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/weekly-reports?project_id=${projectId}`)
      const data = await res.json()
      setReports(data.reports ?? [])
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleGenerate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/intelligence/weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReports(prev => [data.report, ...prev])
      setExpandedId(data.report?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#525252]">{reports.length} report{reports.length !== 1 ? 's' : ''} generated</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-xs border border-[#f59e0b]/30 text-[#f59e0b] px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {generating ? (
            <>
              <span className="flex gap-0.5">
                {[0,1,2].map(i => (
                  <span key={i} className="inline-block w-1 h-1 rounded-full bg-[#f59e0b]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
              Generating…
            </>
          ) : (
            'Generate Weekly Report'
          )}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          ⚠️ {error}
        </div>
      )}

      {reports.length === 0 && !generating && (
        <div className="text-center py-10 text-[#525252]">
          <p className="text-sm mb-3">No weekly reports yet for {projectName}</p>
          <button
            onClick={handleGenerate}
            className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors"
          >
            Generate first report
          </button>
        </div>
      )}

      {reports.map(report => {
        const isExpanded = expandedId === report.id
        const preview = report.report_text.slice(0, 180)
        const date = new Date(report.created_at)
        return (
          <div key={report.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg hover:border-[#2a2a2a] transition-colors">
            <div
              className="px-4 py-3 flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : report.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded">WEEKLY</span>
                <span className="text-xs text-[#a3a3a3]">
                  {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(report.report_text) }}
                  className="text-[10px] text-[#525252] hover:text-[#a3a3a3] transition-colors"
                >
                  Copy
                </button>
                <span className="text-[10px] text-[#525252]">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>
            {!isExpanded && (
              <div className="px-4 pb-3">
                <p className="text-xs text-[#525252] leading-relaxed">{preview}{report.report_text.length > 180 ? '…' : ''}</p>
              </div>
            )}
            {isExpanded && (
              <div className="border-t border-[#1a1a1a] p-4">
                <div className="text-xs text-[#a3a3a3] leading-relaxed whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                  {report.report_text.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) {
                      return <p key={i} className="text-xs font-semibold text-[#f59e0b] uppercase tracking-wider mt-4 mb-1 first:mt-0">{line.slice(3)}</p>
                    }
                    if (line.trim() === '') return <div key={i} className="h-1" />
                    return <p key={i} className="text-xs text-[#737373] leading-relaxed">{line}</p>
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
