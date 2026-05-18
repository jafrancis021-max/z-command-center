'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface EmailDraftRow {
  id: string
  email_id: string
  to_address: string | null
  subject: string | null
  body: string
  context_note: string | null
  status: string
  approved_at: string | null
  linked_project_id: string | null
  created_at: string
  email: {
    subject: string | null
    sender_email: string | null
    received_at: string | null
  } | null
}

const STATUS_CONFIG: Record<string, { dot: string; text: string; label: string }> = {
  pending:  { dot: 'bg-[#f59e0b]', text: 'text-[#f59e0b]', label: 'Pending approval' },
  approved: { dot: 'bg-[#22c55e]', text: 'text-[#22c55e]', label: 'Approved' },
  rejected: { dot: 'bg-red-500',   text: 'text-red-400',   label: 'Rejected' },
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<EmailDraftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '30' })
    if (filterStatus !== 'all') params.set('status', filterStatus)
    const res = await fetch(`/api/gmail/draft?${params}`)
    if (res.ok) setDrafts(await res.json())
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopying(id)
    setTimeout(() => setCopying(null), 2000)
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
          <h1 className="text-sm font-semibold text-[#e5e5e5]">Drafts</h1>
          <p className="text-[10px] text-[#525252]">AI-generated reply drafts — approval required before use</p>
        </div>
        <Link href="/approvals" className="text-xs text-[#a3a3a3] border border-[#2a2a2a] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
          Approvals →
        </Link>
      </header>

      <main className="px-6 py-6 max-w-4xl mx-auto space-y-4">
        {/* Safety notice */}
        <div className="text-xs text-[#525252] bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-3">
          ⚠ These drafts require approval before use. No email sending happens from Z. To send, approve the item in{' '}
          <Link href="/approvals" className="text-[#f59e0b] hover:underline">Approvals</Link> and copy the draft text manually.
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-2">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1 rounded-lg capitalize transition-colors ${
                filterStatus === s
                  ? 'bg-[#1a1a1a] text-[#e5e5e5] border border-[#2a2a2a]'
                  : 'text-[#525252] hover:text-[#a3a3a3] border border-transparent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-xs text-[#525252] text-center py-12">Loading…</div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-16 text-[#525252]">
            <p className="text-sm">No drafts found. Generate a draft reply from Inbox or Triage.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {drafts.map(draft => {
              const cfg = STATUS_CONFIG[draft.status] ?? STATUS_CONFIG.pending
              return (
                <div key={draft.id} className="bg-[#111] border border-[#1e1e1e] rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left px-4 py-3 hover:bg-[#161616] transition-colors"
                    onClick={() => setExpanded(expanded === draft.id ? null : draft.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e5e5e5] font-medium truncate">
                          {draft.subject ?? draft.email?.subject ?? '(no subject)'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[#737373]">
                            To: {draft.to_address ?? draft.email?.sender_email ?? 'unknown'}
                          </span>
                          <span className="text-[10px] text-[#525252]">·</span>
                          <span className={`text-[10px] ${cfg.text}`}>{cfg.label}</span>
                          <span className="text-[10px] text-[#525252]">·</span>
                          <span className="text-[10px] text-[#525252]">{relativeTime(draft.created_at)}</span>
                        </div>
                        {draft.email?.sender_email && (
                          <p className="text-xs text-[#525252] mt-0.5">
                            In reply to {draft.email.sender_email} · {relativeTime(draft.email.received_at)}
                          </p>
                        )}
                      </div>
                      <span className="text-[#525252] shrink-0">{expanded === draft.id ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expanded === draft.id && (
                    <div className="px-4 pb-4 border-t border-[#1a1a1a] space-y-3">
                      {draft.context_note && (
                        <p className="mt-3 text-xs text-[#525252] italic">{draft.context_note}</p>
                      )}

                      <div>
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Draft text</p>
                        <pre className="text-xs text-[#a3a3a3] whitespace-pre-wrap bg-[#0d0d0d] border border-[#1a1a1a] rounded p-3 max-h-56 overflow-y-auto font-sans leading-relaxed">
                          {draft.body}
                        </pre>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => copyToClipboard(draft.body, draft.id)}
                          className="text-[10px] text-[#a3a3a3] border border-[#2a2a2a] px-2 py-1 rounded hover:border-[#22c55e]/30 hover:text-[#22c55e] transition-colors"
                        >
                          {copying === draft.id ? '✓ Copied' : 'Copy draft'}
                        </button>
                        <Link
                          href="/approvals"
                          className="text-[10px] text-[#f59e0b] border border-[#f59e0b]/20 px-2 py-1 rounded hover:bg-[#f59e0b]/10 transition-colors"
                        >
                          Review approval →
                        </Link>
                      </div>

                      <p className="text-[9px] text-[#525252]">
                        Draft ID: {draft.id} — Status: {draft.status} — No auto-send. Must be manually approved and sent.
                      </p>
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
