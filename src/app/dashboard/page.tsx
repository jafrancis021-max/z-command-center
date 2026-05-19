import Link from 'next/link'
import { getDashboardData, getPendingApprovals, getActionLogs } from '@/lib/supabase'
import ProjectCard from '@/components/ProjectCard'
import TodaysPriorities from '@/components/TodaysPriorities'
import GlobalSearch from '@/components/GlobalSearch'
import CrossProjectIntelligence from '@/components/CrossProjectIntelligence'
import OperationalFeed from '@/components/OperationalFeed'
import OperationalRuntime from '@/components/OperationalRuntime'
import NotificationCenter from '@/components/NotificationCenter'

export const dynamic = 'force-dynamic'

// ── Operational stat cell (horizontal strip) ─────────────────────────────────

function StatCell({
  value,
  label,
  valueColor = 'text-[#2e2e2e]',
  href,
  live = false,
}: {
  value: number | string
  label: string
  valueColor?: string
  href?: string
  live?: boolean
}) {
  const inner = (
    <div className="flex flex-col justify-center gap-1.5 px-5 py-4 flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <p className={`text-[28px] font-bold tabular-nums leading-none ${valueColor}`}>{value}</p>
        {live && (
          <span className="relative flex items-center justify-center w-2 h-2 shrink-0 mb-0.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-25 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#22c55e]" />
          </span>
        )}
      </div>
      <p className="text-[9px] text-[#7a7a7a] font-medium tracking-wide">{label}</p>
    </div>
  )

  if (href) return (
    <Link href={href} className="flex-1 hover:bg-[#0d0d0d] transition-colors group">
      {inner}
    </Link>
  )
  return inner
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  sub,
  action,
  live = false,
}: {
  title: string
  count?: number
  sub?: string
  action?: React.ReactNode
  live?: boolean
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {live && (
          <span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
        )}
        <h2 className="text-[10.5px] font-semibold text-[#909090] uppercase tracking-[0.09em]">{title}</h2>
        {count !== undefined && (
          <span className="text-[8px] text-[#707070] bg-[#111] border border-[#1a1a1a] px-1.5 py-0.5 rounded-full tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {sub && <p className="text-[9px] text-[#6a6a6a]">{sub}</p>}
        {action}
      </div>
    </div>
  )
}

// ── Activity log row ──────────────────────────────────────────────────────────

function ActivityRow({
  log,
  last,
}: {
  log: { id: string; action_type: string; summary: string | null; status: string; created_at: string }
  last: boolean
}) {
  const statusColor =
    log.status === 'completed' ? 'bg-[#22c55e]' :
    log.status === 'failed'    ? 'bg-red-500'   :
                                 'bg-[#f59e0b]'
  const statusTextColor =
    log.status === 'completed' ? 'text-[#22c55e]' :
    log.status === 'failed'    ? 'text-red-400'   :
                                 'text-[#f59e0b]'
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${!last ? 'border-b border-[#0f0f0f]' : ''} hover:bg-[#0e0e0e] transition-colors group`}
    >
      <span className={`w-1 h-1 rounded-full shrink-0 ${statusColor}`} />
      <span className="text-[8.5px] text-[#9a9a9a] font-mono shrink-0 w-28 truncate group-hover:text-[#c0c0c0] transition-colors">{log.action_type}</span>
      <span className="flex-1 truncate text-[9.5px] text-[#a8a8a8]">{log.summary}</span>
      <span className={`shrink-0 text-[7.5px] font-medium ${statusTextColor} opacity-80`}>{log.status}</span>
      <span className="shrink-0 text-[7.5px] text-[#6a6a6a] tabular-nums font-mono">
        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getDashboardData>> = []
  let pendingApprovals = 0
  let recentLogs: Awaited<ReturnType<typeof getActionLogs>> = []
  let error = ''

  try {
    const [dashData, approvals, logs] = await Promise.all([
      getDashboardData(),
      getPendingApprovals(5),
      getActionLogs(8),
    ])
    data             = dashData
    pendingApprovals = approvals.length
    recentLogs       = logs
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load'
  }

  const activeProjects  = data.filter(d => d.project.status === 'active').length
  const blockedProjects = data.filter(d => d.project.main_blocker).length

  return (
    <div className="min-h-screen bg-[#080808]">

      {/* ── Sticky header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-[#131313] bg-[#080808]/96 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-20 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#22c55e]" />
          </span>
          <p className="text-[10px] font-semibold text-[#a0a0a0] uppercase tracking-[0.1em]">Command Center</p>
        </div>

        <div className="w-px h-4 bg-[#1a1a1a] shrink-0" />

        <div className="flex-1 flex justify-center">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {activeProjects > 0 && (
            <div className="flex items-center gap-1.5 text-[9px] bg-[#22c55e]/[0.06] border border-[#22c55e]/15 text-[#22c55e] px-2.5 py-1.5 rounded-xl">
              <span className="relative flex items-center justify-center w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-25 animate-ping" />
                <span className="relative inline-flex rounded-full h-1 w-1 bg-[#22c55e]" />
              </span>
              {activeProjects} running
            </div>
          )}
          {pendingApprovals > 0 && (
            <Link
              href="/approvals"
              className="flex items-center gap-1.5 text-[9px] bg-[#f59e0b]/[0.06] border border-[#f59e0b]/14 text-[#f59e0b] px-2.5 py-1.5 rounded-xl hover:bg-[#f59e0b]/[0.10] transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-[#f59e0b] animate-pulse" />
              {pendingApprovals} pending
            </Link>
          )}
          <NotificationCenter />
        </div>
      </header>

      <main className="px-6 py-5 max-w-[1200px] mx-auto space-y-6">

        {/* ── Error ─────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/[0.04] border border-red-500/12 rounded-2xl text-red-400 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            {error} — Check your Supabase environment variables.
          </div>
        )}

        {/* ── Operational intelligence ─────────────────────────── */}
        {!error && (
          <section>
            <TodaysPriorities />
          </section>
        )}

        {/* ── Metrics strip ─────────────────────────────────────── */}
        {!error && (
          <div className="flex items-stretch bg-[#090909] border border-[#181818] rounded-2xl overflow-hidden divide-x divide-[#181818]">
            <StatCell
              value={data.length}
              label="Workspaces"
              valueColor="text-[#555]"
            />
            <StatCell
              value={activeProjects}
              label="Active"
              valueColor={activeProjects > 0 ? 'text-[#22c55e]' : 'text-[#2a2a2a]'}
              live={activeProjects > 0}
            />
            <StatCell
              value={pendingApprovals}
              label="Approvals"
              valueColor={pendingApprovals > 0 ? 'text-[#f59e0b]' : 'text-[#2a2a2a]'}
              href="/approvals"
            />
            <StatCell
              value={blockedProjects}
              label="Blockers"
              valueColor={blockedProjects > 0 ? 'text-red-400' : 'text-[#2a2a2a]'}
            />
            <StatCell
              value={recentLogs.length}
              label="Sessions"
              valueColor="text-[#2a2a2a]"
            />
          </div>
        )}

        {/* ── Cross-project intelligence ─────────────────────────── */}
        {!error && data.length > 1 && (
          <section>
            <CrossProjectIntelligence />
          </section>
        )}

        {/* ── Main operational grid: workspaces + live right panel ── */}
        {!error && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">

            {/* Workspace column */}
            <section>
              <SectionHeader
                title="Workspaces"
                count={data.length}
                sub={activeProjects > 0 ? `${activeProjects} active` : undefined}
                live={activeProjects > 0}
              />

              {data.length === 0 ? (
                <div className="text-center py-20 bg-[#0a0a0a] border border-[#161616] rounded-2xl">
                  <div className="w-12 h-12 rounded-2xl bg-[#141414] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-5 h-5 text-[#2e2e2e]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" />
                      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" />
                      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" />
                      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-[#444]">No projects found.</p>
                  <p className="text-[9px] mt-1 text-[#2e2e2e]">Run the SQL schema in Supabase to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.map(({ project, latestTask, latestDecision }) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      latestTask={latestTask}
                      latestDecision={latestDecision}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Live operational right panel */}
            <div className="space-y-5 min-w-0">
              <section>
                <OperationalFeed />
              </section>

              <section>
                <SectionHeader title="Runtime" />
                <OperationalRuntime />
              </section>
            </div>
          </div>
        )}

        {/* ── Recent activity log ─────────────────────────────────── */}
        {recentLogs.length > 0 && (
          <section>
            <SectionHeader title="Recent Activity" count={recentLogs.length} />
            <div className="bg-[#0a0a0a] border border-[#151515] rounded-2xl overflow-hidden">
              {recentLogs.map((log, i) => (
                <ActivityRow key={log.id} log={log} last={i === recentLogs.length - 1} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
