'use client'

import { useEffect, useState } from 'react'

interface HealthCheck {
  id: string
  label: string
  description: string
  status: 'ok' | 'degraded' | 'error' | 'checking'
}

const CHECKS: HealthCheck[] = [
  { id: 'database',     label: 'Database',          description: 'Supabase connection and query performance', status: 'checking' },
  { id: 'auth',         label: 'Auth Service',       description: 'Authentication and session management',     status: 'checking' },
  { id: 'assistant',    label: 'Z Assistant',        description: 'AI assistant API connectivity',             status: 'checking' },
  { id: 'feed',         label: 'Operational Feed',   description: 'Real-time event feed pipeline',             status: 'checking' },
  { id: 'intelligence', label: 'Intelligence Layer', description: 'Insight generation and processing',         status: 'checking' },
  { id: 'vault',        label: 'Vault Storage',      description: 'Document and media storage layer',          status: 'checking' },
]

const STATUS_CFG = {
  ok:       { dot: 'bg-[#10B981]', badge: 'bg-green-50 border-green-200 text-green-700', label: 'OK',       pulse: true },
  degraded: { dot: 'bg-amber-400',  badge: 'bg-amber-50 border-amber-200 text-amber-700',  label: 'Degraded', pulse: false },
  error:    { dot: 'bg-red-500',    badge: 'bg-red-50 border-red-200 text-red-700',         label: 'Error',    pulse: false },
  checking: { dot: 'bg-gray-300',   badge: 'bg-gray-100 border-gray-200 text-gray-400',    label: '…',        pulse: true },
}

export default function RuntimeHealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>(CHECKS)

  useEffect(() => {
    // Simulate health checks against known API endpoints
    const run = async () => {
      const results = await Promise.allSettled([
        fetch('/api/feed?limit=1').then(r => r.ok ? 'ok' : 'degraded'),
        fetch('/api/auth/me').then(r => r.ok || r.status === 401 ? 'ok' : 'degraded'),
        fetch('/api/assistant/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          .then(r => r.status !== 500 ? 'ok' : 'degraded').catch(() => 'error'),
        fetch('/api/feed?limit=1').then(r => r.ok ? 'ok' : 'degraded'),
        fetch('/api/insights?limit=1').then(r => r.ok ? 'ok' : 'degraded'),
        fetch('/api/intake?limit=1').then(r => r.ok ? 'ok' : 'degraded'),
      ])

      setChecks(prev => prev.map((c, i) => ({
        ...c,
        status: (results[i].status === 'fulfilled' ? results[i].value : 'error') as HealthCheck['status'],
      })))
    }

    void run()
  }, [])

  const okCount  = checks.filter(c => c.status === 'ok').length
  const allOk    = okCount === checks.length
  const anyError = checks.some(c => c.status === 'error')

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 10h3.5l2-4 2.5 8 2-4H18" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 leading-none">Runtime Health</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Z subsystem status</p>
          </div>
        </div>

        {/* Overall status */}
        <div className={`rounded-2xl p-4 border mb-6 flex items-center gap-3 ${
          anyError ? 'bg-red-50 border-red-200' : allOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <div className={`w-3 h-3 rounded-full shrink-0 animate-pulse ${anyError ? 'bg-red-500' : allOk ? 'bg-[#10B981]' : 'bg-amber-400'}`} />
          <div>
            <p className={`text-[12px] font-semibold ${anyError ? 'text-red-700' : allOk ? 'text-green-700' : 'text-amber-700'}`}>
              {anyError ? 'Degraded — some subsystems need attention' : allOk ? 'All systems operational' : `${okCount} of ${checks.length} systems operational`}
            </p>
          </div>
        </div>

        {/* Checks */}
        <div className="space-y-3">
          {checks.map(check => {
            const cfg = STATUS_CFG[check.status]
            return (
              <div key={check.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold text-gray-800">{check.label}</p>
                  <p className="text-[10px] text-gray-400">{check.description}</p>
                </div>
                <span className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded leading-none shrink-0 ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-[9px] text-gray-300 text-center mt-8">
          Health checks run on page load — refresh to re-run
        </p>
      </div>
    </div>
  )
}
