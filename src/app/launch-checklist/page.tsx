'use client'

import { useState, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string
  step: number
  title: string
  description: string
  href?: string
  action?: string
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'connect_gmail',
    step: 1,
    title: 'Connect Gmail',
    description: 'Link your Gmail account so Z can monitor incoming mail, surface urgent emails, and auto-generate case leads.',
    href: '/connections',
    action: 'Connect Gmail',
  },
  {
    id: 'connect_calendar',
    step: 2,
    title: 'Connect Google Calendar',
    description: 'Let Z see your schedule so it can coordinate deadlines, flag conflicts, and factor meetings into operational planning.',
    href: '/connections',
    action: 'Connect Calendar',
  },
  {
    id: 'upload_document',
    step: 3,
    title: 'Upload your first document',
    description: 'Add a contract, brief, or any operational document to the Vault — your central evidence hub.',
    href: '/vault',
    action: 'Open Vault',
  },
  {
    id: 'add_screenshot',
    step: 4,
    title: 'Add a screenshot',
    description: 'Capture a page, confirmation, or piece of evidence directly into the Vault for audit-ready storage.',
    href: '/vault',
    action: 'Open Vault',
  },
  {
    id: 'create_case',
    step: 5,
    title: 'Create your first case',
    description: 'A case is an operational thread — link documents, track status, and let Z surface what needs attention.',
    href: '/cases',
    action: 'Open Cases',
  },
  {
    id: 'review_workflow',
    step: 6,
    title: 'Review a workflow suggestion',
    description: 'Z will propose automation once it learns your operation. Review the first suggestion and approve or modify it.',
    href: '/workflows',
    action: 'Open Workflows',
  },
  {
    id: 'approve_action',
    step: 7,
    title: 'Approve your first action',
    description: 'Z never acts without approval. Find a pending approval and authorize or decline it to train Z on your standards.',
    href: '/workflows',
    action: 'Review Approvals',
  },
  {
    id: 'open_timeline',
    step: 8,
    title: 'Open the Timeline',
    description: 'The Timeline is a tamper-evident operational replay — see every event, action, and decision in sequence.',
    href: '/timeline',
    action: 'Open Timeline',
  },
  {
    id: 'run_system_proof',
    step: 9,
    title: 'Run a System Proof',
    description: 'System Proof validates the integrity of your operational infrastructure — run it once to establish a baseline.',
    href: '/system-proof',
    action: 'Run System Proof',
  },
  {
    id: 'verify_health',
    step: 10,
    title: 'Verify Runtime Health',
    description: 'Check that all Z subsystems are running — feeds, intelligence, connections, and audit logging.',
    href: '/runtime-health',
    action: 'Check Health',
  },
]

// ── Progress helpers ──────────────────────────────────────────────────────────

function CheckCircle({ done }: { done: boolean }) {
  if (done) {
    return (
      <div className="w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 10l4 4 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-6 h-6 rounded-full border-2 border-gray-200 bg-white shrink-0" />
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LaunchChecklistPage() {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: { checklist_progress?: Record<string, boolean> } | null) => {
        if (d?.checklist_progress) {
          const done = Object.entries(d.checklist_progress)
            .filter(([, v]) => v)
            .map(([k]) => k)
          setCompleted(new Set(done))
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  function toggleItem(id: string) {
    setCompleted(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      // Persist to profile (fire-and-forget)
      const progress: Record<string, boolean> = {}
      CHECKLIST_ITEMS.forEach(item => { progress[item.id] = next.has(item.id) })
      fetch('/api/auth/checklist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ progress }),
      }).catch(() => null)
      return next
    })
  }

  const doneCount  = completed.size
  const totalCount = CHECKLIST_ITEMS.length
  const pct        = Math.round((doneCount / totalCount) * 100)
  const allDone    = doneCount === totalCount

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-gray-900 leading-none">Launch Checklist</h1>
              <p className="text-[11px] text-gray-400 mt-0.5">Get your operation fully connected</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-700">
                {allDone ? 'Operation fully launched' : `${doneCount} of ${totalCount} steps complete`}
              </p>
              <span className={`text-[11px] font-bold ${allDone ? 'text-[#10B981]' : 'text-blue-600'}`}>
                {pct}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-[#10B981]' : 'bg-[#2563EB]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {allDone && (
              <p className="text-[10px] text-[#10B981] font-medium mt-2">
                Z is fully operational. Your workspace is live.
              </p>
            )}
          </div>
        </div>

        {/* Checklist */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {CHECKLIST_ITEMS.map((item, idx) => {
              const done    = completed.has(item.id)
              const locked  = !done && idx > 0 && !completed.has(CHECKLIST_ITEMS[idx - 1].id) && idx > 1

              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4 shadow-sm transition-all ${
                    done
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => !locked && toggleItem(item.id)}
                      className="mt-0.5"
                      disabled={locked}
                    >
                      <CheckCircle done={done} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">
                          Step {item.step}
                        </span>
                        {done && (
                          <span className="text-[8.5px] font-semibold text-[#10B981] bg-green-50 border border-green-200 px-1.5 py-0.5 rounded leading-none">
                            Done
                          </span>
                        )}
                      </div>
                      <p className={`text-[12px] font-semibold leading-snug mb-1 ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {item.title}
                      </p>
                      {!done && (
                        <p className="text-[10.5px] text-gray-400 leading-relaxed mb-2">
                          {item.description}
                        </p>
                      )}
                      {!done && item.href && (
                        <a
                          href={item.href}
                          className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          {item.action}
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-[9px] text-gray-300 text-center mt-8">
          You can return to this checklist at any time from the sidebar
        </p>
      </div>
    </div>
  )
}
