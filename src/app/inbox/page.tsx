'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Email, InboxWorkflowSuggestion } from '@/types'

interface GmailStatus {
  connected: boolean
  account?: { email_address: string; status: string; last_synced_at: string | null; connected_at: string }
  email_count?: number
  error?: string   // 'db_error' | 'encryption_key_changed_or_invalid' etc.
  detail?: string
}

const URGENCY_CONFIG: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-500/15',   text: 'text-red-400' },
  high:     { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]' },
  medium:   { bg: 'bg-blue-500/10',  text: 'text-blue-400' },
  low:      { bg: 'bg-[#1a1a1a]',    text: 'text-[#525252]' },
}

const CATEGORY_COLORS: Record<string, string> = {
  urgent:          'text-red-400',
  project_related: 'text-[#f59e0b]',
  admin:           'text-[#737373]',
  finance:         'text-[#22c55e]',
  opportunity:     'text-blue-400',
  ignore:          'text-[#525252]',
  uncategorized:   'text-[#525252]',
}

export default function InboxPage() {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncResult, setSyncResult] = useState<string>('')
  const [filterUrgency, setFilterUrgency] = useState<string>('all')
  const [filterAction, setFilterAction] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<InboxWorkflowSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true)
    try {
      const res = await fetch('/api/inbox-workflow-suggestions?status=suggested&limit=20')
      if (res.ok) setSuggestions(await res.json())
    } finally {
      setSuggestionsLoading(false)
    }
  }, [])

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await fetch('/api/gmail/status')
      const json = await res.json()
      setStatus(json)
    } catch {
      // Network error — leave status null so UI shows reconnect
      setStatus({ connected: false, error: 'network_error' })
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const loadEmails = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' })
    if (filterUrgency !== 'all') params.set('urgency', filterUrgency)
    if (filterAction) params.set('requires_action', 'true')
    const res = await fetch(`/api/gmail/sync?${params}`)
    if (res.ok) setEmails(await res.json())
    setLoading(false)
  }, [filterUrgency, filterAction])

  useEffect(() => {
    Promise.all([loadStatus(), loadEmails(), loadSuggestions()])
  }, [loadStatus, loadEmails, loadSuggestions])

  useEffect(() => { loadEmails() }, [loadEmails])

  async function handleSync() {
    setSyncing(true)
    setSyncResult('')
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(`Synced ${data.synced} new emails`)
        await Promise.all([loadStatus(), loadEmails(), loadSuggestions()])
      } else {
        setSyncResult(`Error: ${data.error}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Gmail? You can reconnect any time.')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'POST' })
      if (res.ok) {
        await loadStatus()
        setEmails([])
      }
    } finally {
      setDisconnecting(false)
    }
  }

  function relativeTime(iso: string | null) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-[#1a1a1a] px-6 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="text-[#525252] hover:text-[#a3a3a3] text-sm transition-colors">← Dashboard</Link>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-[#e5e5e5]">Inbox</h1>
          <p className="text-[10px] text-[#525252]">Gmail integration</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/email-triage" className="text-xs text-[#a3a3a3] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
            Triage
          </Link>
          <Link href="/drafts" className="text-xs text-[#a3a3a3] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
            Drafts
          </Link>
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-6">

        {/* Gmail connection status */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {statusLoading ? (
                <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] animate-pulse" />
              ) : (
                <div className={`w-2.5 h-2.5 rounded-full ${status?.connected ? 'bg-[#22c55e]' : 'bg-[#525252]'}`} />
              )}
              <div>
                {statusLoading ? (
                  <p className="text-sm font-medium text-[#525252]">Checking Gmail status…</p>
                ) : status?.connected ? (
                  <>
                    <p className="text-sm font-medium text-[#e5e5e5]">{status.account?.email_address}</p>
                    {status.account?.last_synced_at && (
                      <p className="text-[10px] text-[#525252] mt-0.5">
                        Last synced {relativeTime(status.account.last_synced_at)} · {status.email_count} emails stored
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-[#e5e5e5]">Gmail not connected</p>
                    {status?.error === 'db_error' ? (
                      <p className="text-[10px] text-red-400 mt-0.5">DB error — check Supabase env vars</p>
                    ) : status?.error === 'network_error' ? (
                      <p className="text-[10px] text-red-400 mt-0.5">Network error checking status</p>
                    ) : (
                      <p className="text-[10px] text-[#525252] mt-0.5">Connect your Gmail account to start syncing</p>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!statusLoading && !status?.connected && (
                <a
                  href="/api/gmail/connect"
                  className="text-sm px-4 py-2 rounded-lg bg-[#f59e0b] text-black font-medium hover:bg-[#f59e0b]/90 transition-colors"
                >
                  Connect Gmail
                </a>
              )}
              {!statusLoading && status?.connected && (
                <>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="text-sm px-4 py-2 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/20 disabled:opacity-40 transition-colors"
                  >
                    {syncing ? 'Syncing…' : 'Sync Emails'}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="text-xs px-3 py-2 rounded-lg border border-[#2a2a2a] text-[#525252] hover:border-red-500/30 hover:text-red-400 disabled:opacity-40 transition-colors"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </>
              )}
            </div>
          </div>
          {syncResult && (
            <p className="mt-3 text-xs text-[#a3a3a3] bg-[#0d0d0d] border border-[#1a1a1a] rounded px-3 py-2">{syncResult}</p>
          )}
        </div>

        {/* Filters */}
        {status?.connected && (
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'critical', 'high', 'medium', 'low'].map(u => (
              <button
                key={u}
                onClick={() => setFilterUrgency(u)}
                className={`text-xs px-3 py-1 rounded-lg capitalize transition-colors ${
                  filterUrgency === u
                    ? 'bg-[#1a1a1a] text-[#e5e5e5] border border-[#2a2a2a]'
                    : 'text-[#525252] hover:text-[#a3a3a3] border border-transparent'
                }`}
              >
                {u}
              </button>
            ))}
            <button
              onClick={() => setFilterAction(!filterAction)}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                filterAction
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-[#525252] hover:text-[#a3a3a3] border border-transparent'
              }`}
            >
              ⚡ Action required
            </button>
          </div>
        )}

        {/* Workflow Suggestions */}
        <WorkflowSuggestionsSection
          suggestions={suggestions}
          loading={suggestionsLoading}
          onAction={loadSuggestions}
        />

        {/* Email list */}
        {loading ? (
          <div className="text-xs text-[#525252] text-center py-12">Loading…</div>
        ) : emails.length === 0 ? (
          <div className="text-center py-16 text-[#525252]">
            <p className="text-sm">{status?.connected ? 'No emails found. Try syncing.' : 'Connect Gmail to get started.'}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {emails.map(email => {
              const urg = URGENCY_CONFIG[email.urgency] ?? URGENCY_CONFIG.low
              return (
                <div key={email.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-[#161616] transition-colors"
                    onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                  >
                    <div className="flex items-start gap-3">
                      {email.requires_action && (
                        <span className="mt-0.5 text-[#f59e0b] text-xs shrink-0">⚡</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-[#e5e5e5] font-medium truncate">
                            {email.subject ?? '(no subject)'}
                          </span>
                          {email.category !== 'uncategorized' && (
                            <span className={`text-[10px] capitalize shrink-0 ${CATEGORY_COLORS[email.category] ?? 'text-[#525252]'}`}>
                              {email.category.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[#737373] truncate">{email.sender_email}</span>
                          <span className="text-[10px] text-[#525252]">·</span>
                          <span className="text-[10px] text-[#525252]">{relativeTime(email.received_at)}</span>
                        </div>
                        {email.snippet && (
                          <p className="text-xs text-[#525252] mt-1 line-clamp-1">{email.snippet}</p>
                        )}
                      </div>
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded capitalize ${urg.bg} ${urg.text}`}>
                        {email.urgency}
                      </span>
                    </div>
                  </button>

                  {expandedId === email.id && (
                    <div className="px-4 pb-4 border-t border-[#1a1a1a] space-y-3">
                      {email.body_text && (
                        <div className="mt-3">
                          <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Body</p>
                          <pre className="text-xs text-[#737373] whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed font-sans">
                            {email.body_text.slice(0, 1200)}
                          </pre>
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href="/email-triage"
                          className="text-[10px] text-[#f59e0b] border border-[#f59e0b]/20 px-2 py-1 rounded hover:bg-[#f59e0b]/10 transition-colors"
                        >
                          View triage →
                        </Link>
                        <GenerateDraftButton emailId={email.id} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

const SUGGESTION_TYPE_LABEL: Record<string, string> = {
  approval_needed:    'Approval needed',
  follow_up_needed:  'Follow-up needed',
  blocker_detected:  'Blocker detected',
  task_candidate:    'Task candidate',
  handover_candidate:'Handover candidate',
  meeting_candidate: 'Meeting candidate',
  document_request:  'Document request',
  unknown:           'Unknown',
}

const SUGGESTION_TYPE_COLOR: Record<string, string> = {
  approval_needed:   'text-[#f59e0b]',
  follow_up_needed:  'text-blue-400',
  blocker_detected:  'text-red-400',
  task_candidate:    'text-[#22c55e]',
  handover_candidate:'text-purple-400',
  meeting_candidate: 'text-sky-400',
  document_request:  'text-orange-400',
  unknown:           'text-[#525252]',
}

function WorkflowSuggestionsSection({
  suggestions,
  loading,
  onAction,
}: {
  suggestions: InboxWorkflowSuggestion[]
  loading: boolean
  onAction: () => void
}) {
  if (loading) return null
  if (suggestions.length === 0) return null

  return (
    <section id="workflow-suggestions">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e5e5]">Workflow Suggestions</h2>
          <p className="text-[10px] text-[#525252]">{suggestions.length} pending review</p>
        </div>
      </div>
      <div className="space-y-2">
        {suggestions.map(s => (
          <SuggestionCard key={s.id} suggestion={s} onAction={onAction} />
        ))}
      </div>
    </section>
  )
}

function SuggestionCard({
  suggestion: s,
  onAction,
}: {
  suggestion: InboxWorkflowSuggestion
  onAction: () => void
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)

  async function act(action: 'approve' | 'reject') {
    setBusy(action)
    try {
      const res = await fetch(`/api/inbox-workflow-suggestions/${s.id}/${action}`, { method: 'POST' })
      if (res.ok) {
        setDone(action === 'approve' ? 'approved' : 'rejected')
        setTimeout(onAction, 600)
      }
    } finally {
      setBusy(null)
    }
  }

  const typeColor = SUGGESTION_TYPE_COLOR[s.suggestion_type] ?? 'text-[#525252]'
  const typeLabel = SUGGESTION_TYPE_LABEL[s.suggestion_type] ?? s.suggestion_type
  const pct = Math.round((s.confidence ?? 0) * 100)

  if (done) {
    return (
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 flex items-center gap-2">
        <span className={`text-xs ${done === 'approved' ? 'text-[#22c55e]' : 'text-[#525252]'}`}>
          {done === 'approved' ? '✓ Approved' : '✕ Rejected'}
        </span>
        <span className="text-xs text-[#525252] truncate">{s.title}</span>
      </div>
    )
  }

  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-medium ${typeColor}`}>{typeLabel}</span>
            <span className="text-[9px] text-[#525252] bg-[#1a1a1a] px-1.5 py-0.5 rounded">
              {pct}% confidence
            </span>
          </div>
          <p className="text-sm text-[#e5e5e5] leading-snug">{s.title}</p>
          {s.description && (
            <p className="text-xs text-[#737373] mt-0.5 leading-snug">{s.description}</p>
          )}
          {s.email_subject && (
            <p className="text-[10px] text-[#525252] mt-1 truncate">
              From: {s.email_sender ?? '—'} · {s.email_subject}
            </p>
          )}
        </div>
      </div>

      {Array.isArray(s.suggested_actions) && s.suggested_actions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {s.suggested_actions.map((a, i) => (
            <span
              key={i}
              className="text-[9px] text-[#737373] bg-[#1a1a1a] border border-[#2a2a2a] px-2 py-0.5 rounded"
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => act('approve')}
          disabled={!!busy}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/20 disabled:opacity-40 transition-colors"
        >
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          onClick={() => act('reject')}
          disabled={!!busy}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#2a2a2a] text-[#525252] hover:border-red-500/30 hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  )
}

function GenerateDraftButton({ emailId }: { emailId: string }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch('/api/gmail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_id: emailId }),
      })
      if (res.ok) setDone(true)
    } finally {
      setLoading(false)
    }
  }

  if (done) return <span className="text-[10px] text-[#22c55e]">Draft created → /drafts</span>
  return (
    <button
      onClick={generate}
      disabled={loading}
      className="text-[10px] text-[#a3a3a3] border border-[#2a2a2a] px-2 py-1 rounded hover:border-[#f59e0b]/30 hover:text-[#f59e0b] disabled:opacity-40 transition-colors"
    >
      {loading ? 'Generating…' : 'Generate draft'}
    </button>
  )
}
