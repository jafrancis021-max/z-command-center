'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ClaudeSession, SessionType, SessionStatus } from '@/types'

const STATUS_COLORS: Record<SessionStatus, string> = {
  pending:     'text-[#737373] bg-[#737373]/10 border-[#737373]/20',
  success:     'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
  failed:      'text-red-400 bg-red-500/10 border-red-500/20',
  partial:     'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  rolled_back: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
}

const TYPE_LABELS: Record<SessionType, string> = {
  build: 'BUILD', fix: 'FIX', refactor: 'REFACTOR',
  deploy: 'DEPLOY', investigate: 'INVESTIGATE', other: 'OTHER',
}

interface Props { projectId: string }

export default function ClaudeSessionTab({ projectId }: Props) {
  const [sessions, setSessions] = useState<ClaudeSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showResultForm, setShowResultForm] = useState<string | null>(null)

  // New session form
  const [newForm, setNewForm] = useState({ prompt: '', session_type: 'build' as SessionType })
  const [saving, setSaving] = useState(false)

  // Result form
  const [resultForm, setResultForm] = useState({
    summary: '', outcome: '', files_changed: '', success: true, rollback_notes: '',
  })
  const [savingResult, setSavingResult] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/claude-sessions?project_id=${projectId}`)
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleCreateSession() {
    if (!newForm.prompt.trim()) { setError('Prompt required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/claude-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, prompt: newForm.prompt, session_type: newForm.session_type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSessions(prev => [data.session, ...prev])
      setShowNewForm(false)
      setNewForm({ prompt: '', session_type: 'build' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddResult(sessionId: string) {
    setSavingResult(true)
    setError('')
    try {
      const files = resultForm.files_changed
        ? resultForm.files_changed.split('\n').map(f => f.trim()).filter(Boolean)
        : []
      const res = await fetch('/api/session-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          summary: resultForm.summary || null,
          outcome: resultForm.outcome || null,
          files_changed: files.length > 0 ? files : null,
          success: resultForm.success,
          rollback_notes: resultForm.rollback_notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowResultForm(null)
      setResultForm({ summary: '', outcome: '', files_changed: '', success: true, rollback_notes: '' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSavingResult(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex gap-1">
          {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#525252]">{sessions.length} Claude session{sessions.length !== 1 ? 's' : ''} logged</p>
        <button
          onClick={() => { setShowNewForm(!showNewForm); setError('') }}
          className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
        >
          + Log Session
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          ⚠️ {error}
          <button onClick={() => setError('')} className="ml-2 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* New session form */}
      {showNewForm && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
          <div>
            <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Session Type</label>
            <select
              value={newForm.session_type}
              onChange={e => setNewForm(f => ({ ...f, session_type: e.target.value as SessionType }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] focus:outline-none focus:border-[#f59e0b]/40"
            >
              {(Object.keys(TYPE_LABELS) as SessionType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Claude Code Prompt *</label>
            <textarea
              value={newForm.prompt}
              onChange={e => setNewForm(f => ({ ...f, prompt: e.target.value }))}
              rows={4}
              placeholder="Paste the full prompt you gave Claude Code…"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 font-mono resize-y"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateSession} disabled={saving}
              className="text-xs bg-[#f59e0b] text-black font-semibold px-4 py-2 rounded-lg hover:bg-[#d97706] transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Log Session'}
            </button>
            <button onClick={() => { setShowNewForm(false); setError('') }}
              className="text-xs border border-[#2a2a2a] text-[#525252] px-4 py-2 rounded-lg hover:text-[#a3a3a3] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-12 text-[#525252]">
          <p className="text-sm mb-3">No Claude sessions logged yet</p>
          <button onClick={() => setShowNewForm(true)} className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors">
            Log first session
          </button>
        </div>
      )}

      {/* Session list */}
      {sessions.map(session => {
        const isExpanded = expandedId === session.id
        const results = session.results ?? []
        const latestResult = results[0] ?? null

        return (
          <div key={session.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg hover:border-[#2a2a2a] transition-colors">
            <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : session.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded shrink-0">
                    {TYPE_LABELS[session.session_type]}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLORS[session.status]}`}>
                    {session.status}
                  </span>
                  {results.length > 0 && (
                    <span className="text-[10px] text-[#525252]">{results.length} result{results.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-[#525252]">{new Date(session.created_at).toLocaleDateString()}</span>
                  <span className="text-[10px] text-[#525252]">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>
              <p className="text-xs text-[#737373] mt-2 line-clamp-2 font-mono leading-relaxed">
                {session.prompt.slice(0, 200)}{session.prompt.length > 200 ? '…' : ''}
              </p>
              {latestResult && (
                <p className="text-xs text-[#525252] mt-1.5 line-clamp-1">
                  → {latestResult.summary?.slice(0, 100) ?? latestResult.outcome ?? ''}
                </p>
              )}
            </div>

            {isExpanded && (
              <div className="border-t border-[#1a1a1a] p-4 space-y-4">
                {/* Full prompt */}
                <div>
                  <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1.5">Prompt</p>
                  <pre className="text-xs text-[#737373] font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg p-3">
                    {session.prompt}
                  </pre>
                  <button onClick={() => navigator.clipboard.writeText(session.prompt)}
                    className="text-[10px] text-[#525252] hover:text-[#a3a3a3] mt-1">Copy prompt</button>
                </div>

                {/* Results */}
                {results.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">Results</p>
                    <div className="space-y-2">
                      {results.map(r => (
                        <div key={r.id} className={`p-3 rounded-lg border ${r.success ? 'bg-[#22c55e]/5 border-[#22c55e]/20' : 'bg-red-500/5 border-red-500/20'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-semibold ${r.success ? 'text-[#22c55e]' : 'text-red-400'}`}>
                              {r.success ? '✓ SUCCESS' : '✗ FAILED'}
                            </span>
                            <span className="text-[10px] text-[#525252]">{new Date(r.created_at).toLocaleString()}</span>
                          </div>
                          {r.summary && <p className="text-xs text-[#a3a3a3] mb-1">{r.summary}</p>}
                          {r.outcome && <p className="text-xs text-[#737373] italic">{r.outcome}</p>}
                          {r.files_changed && r.files_changed.length > 0 && (
                            <div className="mt-2">
                              <p className="text-[10px] text-[#525252] mb-1">Files changed:</p>
                              {r.files_changed.map((f, i) => (
                                <p key={i} className="text-[11px] font-mono text-[#737373]">{f}</p>
                              ))}
                            </div>
                          )}
                          {r.rollback_notes && (
                            <p className="text-xs text-orange-400 mt-2">↩ Rollback: {r.rollback_notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add result form */}
                {showResultForm === session.id ? (
                  <div className="space-y-3 border border-[#2a2a2a] rounded-lg p-4">
                    <p className="text-[10px] text-[#525252] uppercase tracking-wider">Record Result</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setResultForm(f => ({ ...f, success: true }))}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${resultForm.success ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/10' : 'border-[#2a2a2a] text-[#525252]'}`}
                      >✓ Success</button>
                      <button
                        onClick={() => setResultForm(f => ({ ...f, success: false }))}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${!resultForm.success ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-[#2a2a2a] text-[#525252]'}`}
                      >✗ Failed</button>
                    </div>
                    <textarea value={resultForm.summary} onChange={e => setResultForm(f => ({ ...f, summary: e.target.value }))}
                      rows={2} placeholder="Summary of what happened"
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 resize-none" />
                    <textarea value={resultForm.files_changed} onChange={e => setResultForm(f => ({ ...f, files_changed: e.target.value }))}
                      rows={2} placeholder="Files changed (one per line)"
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 font-mono resize-none" />
                    {!resultForm.success && (
                      <textarea value={resultForm.rollback_notes} onChange={e => setResultForm(f => ({ ...f, rollback_notes: e.target.value }))}
                        rows={2} placeholder="Rollback notes — what was reverted?"
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-red-500/40 resize-none" />
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleAddResult(session.id)} disabled={savingResult}
                        className="text-xs bg-[#f59e0b] text-black font-semibold px-4 py-2 rounded-lg hover:bg-[#d97706] transition-colors disabled:opacity-50">
                        {savingResult ? 'Saving…' : 'Save Result'}
                      </button>
                      <button onClick={() => setShowResultForm(null)}
                        className="text-xs border border-[#2a2a2a] text-[#525252] px-4 py-2 rounded-lg hover:text-[#a3a3a3]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowResultForm(session.id); setError('') }}
                    className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
                  >
                    + Add Result
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
