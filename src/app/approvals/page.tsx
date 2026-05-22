'use client'

import { useEffect, useState } from 'react'
import type { Approval } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  email_draft:      'Email Draft',
  task_batch:       'Task Batch',
  handover:         'Handover',
  prompt:           'Prompt',
  workflow_action:  'Workflow',
  document_summary: 'Document Summary',
}

const TYPE_TRUST: Record<string, { why: string; impact: string; risk: 'low' | 'medium' | 'high' }> = {
  email_draft:      { why: 'Z drafted outgoing communication that requires your review before sending.',  impact: 'Send an email on your behalf',     risk: 'medium' },
  task_batch:       { why: 'Z queued a set of tasks for execution, requiring sign-off before running.',   impact: 'Execute multiple automated tasks', risk: 'medium' },
  handover:         { why: 'A session handover was prepared to transfer context to the next session.',    impact: 'Persist session state and context', risk: 'low'    },
  prompt:           { why: 'An AI-generated prompt is pending review before being used.',                 impact: 'Feed prompt into AI pipeline',     risk: 'low'    },
  workflow_action:  { why: 'A workflow step triggered an action that must be explicitly authorized.',     impact: 'Trigger downstream workflow step',  risk: 'high'   },
  document_summary: { why: 'Z summarized a document and requires confirmation before filing.',            impact: 'Store summary in operational memory', risk: 'low'  },
}

const RISK_STYLE: Record<string, string> = {
  low:    'text-[#555] border-[#1e1e1e]',
  medium: 'text-[#f59e0b] border-[#f59e0b]/20',
  high:   'text-red-400 border-red-500/20',
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [acting, setActing] = useState<string | null>(null)

  async function load(status = filter) {
    setLoading(true)
    try {
      const res = await fetch(`/api/approvals?status=${status}`)
      const data = await res.json()
      setApprovals(data.approvals ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setActing(id)
    try {
      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== id))
      }
    } finally {
      setActing(null)
    }
  }

  async function handleCreateTest() {
    await fetch('/api/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approval_type: 'prompt',
        title: 'Test approval item',
        description: 'This is a test approval created manually to verify the approval system.',
        payload: { test: true },
      }),
    })
    load('pending')
    setFilter('pending')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-10 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-md px-6 h-14 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-[#e5e5e5]">Approvals</h1>
          <p className="text-[10px] text-[#555]">Nothing executes without your approval</p>
        </div>
        <button
          onClick={handleCreateTest}
          className="text-xs border border-[#2a2a2a] text-[#525252] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
        >
          + Test Item
        </button>
      </header>

      <main className="px-6 py-6 max-w-3xl mx-auto">
        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#1a1a1a] pb-0">
          {(['pending', 'approved', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-2 rounded-t-lg transition-colors ${
                filter === s
                  ? 'text-[#f59e0b] border-b-2 border-[#f59e0b] -mb-px'
                  : 'text-[#525252] hover:text-[#a3a3a3]'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {!loading && approvals.length === 0 && (
          <div className="text-center py-16 text-[#525252]">
            <p className="text-2xl mb-3">✓</p>
            <p className="text-sm">No {filter} approvals</p>
            {filter === 'pending' && (
              <button onClick={handleCreateTest}
                className="mt-4 text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors">
                Create test item
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {approvals.map(approval => {
            const trust = TYPE_TRUST[approval.approval_type]
            const riskStyle = trust ? RISK_STYLE[trust.risk] : RISK_STYLE.low
            return (
              <div
                key={approval.id}
                className="bg-[#0e0e0e] border border-[#1e1e1e] rounded-xl overflow-hidden hover:border-[#2a2a2a] transition-colors"
              >
                {/* Trust context bar */}
                {trust && filter === 'pending' && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-[#0a0a0a] border-b border-[#181818]">
                    <span className={`text-[8.5px] font-semibold px-1.5 py-0.5 rounded border leading-none ${riskStyle}`}>
                      {trust.risk} risk
                    </span>
                    <p className="text-[8.5px] text-[#555] flex-1">{trust.why}</p>
                    <span className="text-[8px] text-[#3a3a3a] shrink-0 border border-[#1e1e1e] px-1.5 py-0.5 rounded">
                      {trust.impact}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded">
                        {TYPE_LABELS[approval.approval_type] ?? approval.approval_type}
                      </span>
                      {approval.project_id && (
                        <span className="text-[10px] text-[#525252]">project linked</span>
                      )}
                      <span className="text-[10px] text-[#525252] ml-auto">
                        {new Date(approval.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#e5e5e5] mb-1">{approval.title}</p>
                    {approval.description && (
                      <p className="text-xs text-[#737373] leading-relaxed whitespace-pre-wrap">
                        {approval.description.slice(0, 400)}
                        {approval.description.length > 400 ? '...' : ''}
                      </p>
                    )}
                    {approval.rejection_note && (
                      <p className="text-xs text-red-400 mt-2 border-t border-red-500/20 pt-2">
                        Rejected: {approval.rejection_note}
                      </p>
                    )}
                    {approval.approved_at && (
                      <p className="text-[10px] text-[#22c55e] mt-1">
                        Approved {new Date(approval.approved_at).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {filter === 'pending' && (
                    <div className="flex flex-col gap-2 shrink-0 items-end">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(approval.id, 'reject')}
                          disabled={acting === approval.id}
                          className="text-xs border border-red-500/30 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleAction(approval.id, 'approve')}
                          disabled={acting === approval.id}
                          className="text-xs bg-[#f59e0b] text-black font-semibold px-3 py-1.5 rounded-lg hover:bg-[#d97706] transition-colors disabled:opacity-50"
                        >
                          {acting === approval.id ? '...' : 'Approve'}
                        </button>
                      </div>
                      {trust && (
                        <p className="text-[8px] text-[#333]">
                          Approving will: {trust.impact.toLowerCase()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
