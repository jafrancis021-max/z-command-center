'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface TriageResult {
  id: string
  classification: string | null
  urgency: string | null
  project_id: string | null
  extracted_tasks: Array<{ title: string; priority: string; deadline: string | null }> | null
  summary: string | null
  suggested_reply: string | null
  confidence: number | null
  reasoning: string | null
  created_at: string
  email: {
    id: string
    subject: string | null
    sender_email: string | null
    snippet: string | null
    received_at: string | null
    urgency: string
    category: string
    requires_action: boolean
  } | null
}

const URGENCY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-[#f59e0b]',
  medium:   'text-blue-400',
  low:      'text-[#525252]',
}

const CLASS_COLOR: Record<string, string> = {
  urgent:          'text-red-400',
  project_related: 'text-[#f59e0b]',
  admin:           'text-[#737373]',
  finance:         'text-[#22c55e]',
  opportunity:     'text-blue-400',
  ignore:          'text-[#525252]',
}

export default function EmailTriagePage() {
  const [results, setResults] = useState<TriageResult[]>([])
  const [loading, setLoading] = useState(true)
  const [triaging, setTriaging] = useState(false)
  const [triageResult, setTriageResult] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/gmail/triage?limit=30')
    if (res.ok) setResults(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function runTriage() {
    setTriaging(true)
    setTriageResult('')
    try {
      const res = await fetch('/api/gmail/triage', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setTriageResult(`Triaged ${data.triaged} emails — ${data.urgent} urgent, ${data.task_approvals} task approvals, ${data.draft_approvals} draft approvals`)
        await load()
      } else {
        setTriageResult(`Error: ${data.error}`)
      }
    } finally {
      setTriaging(false)
    }
  }

  async function generateDraft(emailId: string) {
    setGeneratingDraft(emailId)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_id: emailId }),
      })
      if (res.ok) {
        alert('Draft created and sent to approvals.')
      } else {
        const d = await res.json()
        alert(`Error: ${d.error}`)
      }
    } finally {
      setGeneratingDraft(null)
    }
  }

  function relativeTime(iso: string | null) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-[#1a1a1a] px-6 py-3 flex items-center gap-4">
        <Link href="/inbox" className="text-[#525252] hover:text-[#a3a3a3] text-sm transition-colors">← Inbox</Link>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-[#e5e5e5]">Email Triage</h1>
          <p className="text-[10px] text-[#525252]">AI classification and task extraction</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/drafts" className="text-xs text-[#a3a3a3] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
            Drafts
          </Link>
          <button
            onClick={runTriage}
            disabled={triaging}
            className="text-sm px-4 py-2 rounded-lg bg-[#f59e0b] text-black font-medium hover:bg-[#f59e0b]/90 disabled:opacity-40 transition-colors"
          >
            {triaging ? 'Triaging…' : 'Run Triage'}
          </button>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-4">
        {triageResult && (
          <div className="text-xs text-[#22c55e] bg-[#22c55e]/5 border border-[#22c55e]/20 rounded-lg px-4 py-3">
            {triageResult}
          </div>
        )}

        {loading ? (
          <div className="text-xs text-[#525252] text-center py-12">Loading…</div>
        ) : results.length === 0 ? (
          <div className="text-center py-16 text-[#525252]">
            <p className="text-sm">No triaged emails. Run Triage to classify your inbox.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map(r => (
              <div key={r.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 hover:bg-[#161616] transition-colors"
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-[#e5e5e5] font-medium truncate">
                          {r.email?.subject ?? '(no subject)'}
                        </span>
                        {r.classification && (
                          <span className={`text-[10px] capitalize ${CLASS_COLOR[r.classification] ?? 'text-[#525252]'}`}>
                            {r.classification.replace('_', ' ')}
                          </span>
                        )}
                        {r.email?.requires_action && (
                          <span className="text-[10px] text-[#f59e0b]">⚡ action</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#737373]">{r.email?.sender_email}</span>
                        <span className="text-[10px] text-[#525252]">·</span>
                        <span className="text-[10px] text-[#525252]">{relativeTime(r.email?.received_at ?? null)}</span>
                        {r.confidence != null && (
                          <>
                            <span className="text-[10px] text-[#525252]">·</span>
                            <span className="text-[10px] text-[#525252]">{Math.round((r.confidence ?? 0) * 100)}% confidence</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] capitalize ${URGENCY_COLOR[r.urgency ?? 'low'] ?? 'text-[#525252]'}`}>
                      {r.urgency}
                    </span>
                  </div>
                </button>

                {expanded === r.id && (
                  <div className="px-4 pb-4 border-t border-[#1a1a1a] space-y-4 mt-1">
                    {r.reasoning && (
                      <div className="mt-3">
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">AI Reasoning</p>
                        <p className="text-xs text-[#737373]">{r.reasoning}</p>
                      </div>
                    )}

                    {r.extracted_tasks && r.extracted_tasks.length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">Extracted Tasks ({r.extracted_tasks.length})</p>
                        <div className="space-y-1">
                          {r.extracted_tasks.map((t, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-[#0d0d0d] border border-[#1a1a1a] rounded px-3 py-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-[#f59e0b]' : 'bg-[#525252]'}`} />
                              <span className="text-[#a3a3a3] flex-1">{t.title}</span>
                              {t.deadline && <span className="text-[#525252] text-[10px]">{t.deadline}</span>}
                            </div>
                          ))}
                        </div>
                        <Link
                          href="/approvals"
                          className="inline-block mt-2 text-[10px] text-[#f59e0b] hover:underline"
                        >
                          Review task approval in Approvals →
                        </Link>
                      </div>
                    )}

                    {r.suggested_reply && (
                      <div>
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Suggested Reply</p>
                        <pre className="text-xs text-[#737373] whitespace-pre-wrap bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3 max-h-36 overflow-y-auto font-sans leading-relaxed">
                          {r.suggested_reply}
                        </pre>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap pt-1">
                      <Link
                        href="/approvals"
                        className="text-[10px] text-[#a3a3a3] border border-[#2a2a2a] px-2 py-1 rounded hover:border-[#f59e0b]/30 hover:text-[#f59e0b] transition-colors"
                      >
                        View approvals
                      </Link>
                      {r.email?.id && (
                        <button
                          onClick={() => generateDraft(r.email!.id)}
                          disabled={generatingDraft === r.email?.id}
                          className="text-[10px] text-[#a3a3a3] border border-[#2a2a2a] px-2 py-1 rounded hover:border-[#f59e0b]/30 hover:text-[#f59e0b] disabled:opacity-40 transition-colors"
                        >
                          {generatingDraft === r.email?.id ? 'Generating…' : 'Generate draft reply'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
