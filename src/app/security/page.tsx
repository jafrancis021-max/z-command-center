'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrustMetric {
  id: string
  label: string
  description: string
  status: 'active' | 'pending' | 'inactive'
  detail?: string
}

// ── Trust metrics ─────────────────────────────────────────────────────────────

const TRUST_METRICS: TrustMetric[] = [
  {
    id: 'audit_trail',
    label: 'Audit Trail Active',
    description: 'Every action, approval, and system event is logged with timestamp and actor identity.',
    status: 'active',
    detail: 'Logging since workspace creation',
  },
  {
    id: 'replay_protection',
    label: 'Replay Protection',
    description: 'The operational timeline provides a tamper-evident replay of all events in sequence.',
    status: 'active',
    detail: 'Covered by Timeline module',
  },
  {
    id: 'timeline_integrity',
    label: 'Timeline Integrity',
    description: 'Events cannot be deleted or reordered post-write. The sequence is authoritative.',
    status: 'active',
    detail: 'Append-only event model',
  },
  {
    id: 'tamper_evident',
    label: 'Tamper-Evident Records',
    description: 'Vault documents and audit events include creation metadata that flags modification attempts.',
    status: 'active',
    detail: 'Enforced at storage layer',
  },
  {
    id: 'system_proof',
    label: 'System Proof Active',
    description: 'Infrastructure health checks run continuously and surface degradations before they affect operations.',
    status: 'active',
    detail: 'Monitored via System Proof page',
  },
  {
    id: 'vault_lock',
    label: 'Vault Lock Available',
    description: 'Critical Vault documents can be locked to prevent modification — any access attempt is logged.',
    status: 'pending',
    detail: 'Enable from Vault per-document menu',
  },
  {
    id: 'workflow_lock',
    label: 'Workflow Lock Available',
    description: 'Workflows can be locked to prevent unauthorized changes. Unlock requires explicit approval.',
    status: 'pending',
    detail: 'Enable from Workflows per-workflow menu',
  },
  {
    id: 'member_audit',
    label: 'Member Activity Logging',
    description: 'All member actions — logins, approvals, document access — are recorded in the Audit Trail.',
    status: 'active',
    detail: 'Per session and per action',
  },
]

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  active:   { dot: 'bg-[#10B981]', badge: 'bg-green-50 border-green-200 text-green-700', label: 'Active' },
  pending:  { dot: 'bg-amber-400',  badge: 'bg-amber-50 border-amber-200 text-amber-700',  label: 'Pending' },
  inactive: { dot: 'bg-gray-300',   badge: 'bg-gray-100 border-gray-200 text-gray-500',   label: 'Inactive' },
}

// ── Trust score ───────────────────────────────────────────────────────────────

function TrustScore({ metrics }: { metrics: TrustMetric[] }) {
  const active  = metrics.filter(m => m.status === 'active').length
  const total   = metrics.length
  const pct     = Math.round((active / total) * 100)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Trust Score</p>
          <p className="text-[28px] font-bold text-gray-900 leading-none">{pct}<span className="text-[16px] text-gray-400">%</span></p>
        </div>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${pct >= 80 ? 'bg-green-50 border border-green-200' : pct >= 60 ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
          <svg className={`w-7 h-7 ${pct >= 80 ? 'text-[#10B981]' : pct >= 60 ? 'text-amber-500' : 'text-red-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3L4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6L12 3z" strokeLinejoin="round" />
            <path d="M8 12l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-[#10B981]' : pct >= 60 ? 'bg-amber-400' : 'bg-red-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-gray-400">
        <span>{active} of {total} controls active</span>
        <span>{total - active} pending configuration</span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [lastAuditEvent, setLastAuditEvent] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/audit?limit=1')
      .then(r => r.ok ? r.json() : null)
      .then((d: Array<{ created_at: string }> | null) => {
        if (Array.isArray(d) && d[0]?.created_at) {
          setLastAuditEvent(new Date(d[0].created_at).toLocaleString())
        }
      })
      .catch(() => null)
  }, [])

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3L4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6L12 3z" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-gray-900 leading-none">Security & Trust</h1>
              <p className="text-[11px] text-gray-400 mt-0.5">Operational integrity visibility</p>
            </div>
          </div>
          {lastAuditEvent && (
            <p className="text-[10px] text-gray-400 mt-3">
              Last audit event: <span className="font-medium text-gray-600">{lastAuditEvent}</span>
            </p>
          )}
        </div>

        {/* Trust score */}
        <TrustScore metrics={TRUST_METRICS} />

        {/* Controls */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-1">
            Trust Controls
          </p>
          {TRUST_METRICS.map(metric => {
            const cfg = STATUS_CFG[metric.status]
            return (
              <div key={metric.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot} ${metric.status === 'active' ? 'animate-pulse' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-semibold text-gray-800">{metric.label}</p>
                      <span className={`text-[8.5px] font-semibold border px-1.5 py-0.5 rounded leading-none ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-gray-400 leading-relaxed">{metric.description}</p>
                    {metric.detail && (
                      <p className="text-[9.5px] text-gray-300 mt-1 font-medium">{metric.detail}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Audit link */}
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-blue-700">Full Audit Trail</p>
              <p className="text-[10px] text-blue-500 mt-0.5">Every event, action, and decision in tamper-evident sequence</p>
            </div>
            <a
              href="/audit"
              className="shrink-0 text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-white border border-blue-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              View Audit →
            </a>
          </div>
        </div>

        <p className="text-[9px] text-gray-300 text-center mt-8">
          Z never acts without approval — all autonomous actions require explicit authorization
        </p>
      </div>
    </div>
  )
}
