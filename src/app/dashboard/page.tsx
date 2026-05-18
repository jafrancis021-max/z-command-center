import Link from 'next/link'
import { getDashboardData, getPendingApprovals, getActionLogs } from '@/lib/supabase'
import ProjectCard from '@/components/ProjectCard'
import TodaysPriorities from '@/components/TodaysPriorities'
import GlobalSearch from '@/components/GlobalSearch'
import CrossProjectIntelligence from '@/components/CrossProjectIntelligence'
import OperationalFeed from '@/components/OperationalFeed'
import OperationalRuntime from '@/components/OperationalRuntime'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getDashboardData>> = []
  let pendingApprovals = 0
  let recentLogs: Awaited<ReturnType<typeof getActionLogs>> = []
  let error = ''

  try {
    const [dashData, approvals, logs] = await Promise.all([
      getDashboardData(),
      getPendingApprovals(5),
      getActionLogs(5),
    ])
    data = dashData
    pendingApprovals = approvals.length
    recentLogs = logs
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load projects'
  }

  const activeProjects = data.filter(d => d.project.status === 'active').length

  return (
    <div className="min-h-screen bg-[#0a0a0a]">

      {/* ── Top header bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex-1 flex justify-start max-w-sm">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {pendingApprovals > 0 && (
            <Link
              href="/approvals"
              className="flex items-center gap-1.5 text-xs bg-[#f59e0b]/10 border border-[#f59e0b]/25 text-[#f59e0b] px-2.5 py-1 rounded-lg hover:bg-[#f59e0b]/15 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              {pendingApprovals} pending
            </Link>
          )}
          <span className="text-[10px] text-[#3a3a3a] bg-[#111] border border-[#1a1a1a] px-2 py-1 rounded-md tabular-nums">v1.5</span>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            ⚠ {error} — Check your Supabase environment variables.
          </div>
        )}

        {/* ── Operational intelligence ──────────────────────────────────── */}
        {!error && (
          <section>
            <TodaysPriorities />
          </section>
        )}

        {/* ── Stats grid ────────────────────────────────────────────────── */}
        {!error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

            {/* Total projects */}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#2a2a2a] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#222] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#525252]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
                    <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
                    <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
                    <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
                  </svg>
                </div>
                <span className="text-[9px] text-[#3a3a3a] bg-[#161616] px-1.5 py-0.5 rounded font-mono">all</span>
              </div>
              <p className="text-3xl font-bold text-[#e5e5e5] leading-none tabular-nums">{data.length}</p>
              <p className="text-xs text-[#525252] mt-2">Total Projects</p>
            </div>

            {/* Active */}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#22c55e]/20 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                </div>
                <span className="text-[9px] text-[#22c55e]/50 bg-[#22c55e]/5 border border-[#22c55e]/10 px-1.5 py-0.5 rounded">live</span>
              </div>
              <p className="text-3xl font-bold text-[#22c55e] leading-none tabular-nums">{activeProjects}</p>
              <p className="text-xs text-[#525252] mt-2">Active</p>
            </div>

            {/* Pending approvals */}
            <Link
              href="/approvals"
              className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#f59e0b]/25 transition-colors group block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                  pendingApprovals > 0
                    ? 'bg-[#f59e0b]/10 border-[#f59e0b]/25'
                    : 'bg-[#1a1a1a] border-[#222]'
                }`}>
                  <svg className={`w-4 h-4 ${pendingApprovals > 0 ? 'text-[#f59e0b]' : 'text-[#525252]'}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 5L8 14l-4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-[9px] text-[#525252] group-hover:text-[#f59e0b] transition-colors">→</span>
              </div>
              <p className={`text-3xl font-bold leading-none tabular-nums ${pendingApprovals > 0 ? 'text-[#f59e0b]' : 'text-[#e5e5e5]'}`}>
                {pendingApprovals}
              </p>
              <p className="text-xs text-[#525252] mt-2 group-hover:text-[#a3a3a3] transition-colors">Pending Approvals</p>
            </Link>

            {/* Recent actions */}
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#2a2a2a] transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#222] flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#525252]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M10 2v8l4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="10" cy="10" r="8" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-bold text-[#737373] leading-none tabular-nums">{recentLogs.length}</p>
              <p className="text-xs text-[#525252] mt-2">Recent Actions</p>
            </div>

          </div>
        )}

        {/* ── Cross-project intelligence ────────────────────────────────── */}
        {!error && data.length > 1 && (
          <section>
            <CrossProjectIntelligence />
          </section>
        )}

        {/* ── Projects ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-[#e5e5e5]">Projects</h2>
              {data.length > 0 && (
                <span className="text-[10px] text-[#525252] bg-[#1a1a1a] border border-[#222] px-2 py-0.5 rounded-full tabular-nums">
                  {data.length}
                </span>
              )}
            </div>
            <p className="text-xs text-[#525252]">Active operational workspaces</p>
          </div>

          {!error && data.length === 0 && (
            <div className="text-center py-20 text-[#525252] bg-[#111] border border-[#1a1a1a] rounded-xl">
              <div className="text-3xl mb-3 opacity-30">∅</div>
              <p className="text-sm">No projects found.</p>
              <p className="text-xs mt-1 text-[#3a3a3a]">Run the SQL schema in Supabase to get started.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.map(({ project, latestTask, latestDecision }) => (
              <ProjectCard
                key={project.id}
                project={project}
                latestTask={latestTask}
                latestDecision={latestDecision}
              />
            ))}
          </div>
        </section>

        {/* ── Operational Feed ─────────────────────────────────────────── */}
        {!error && (
          <section>
            <OperationalFeed />
          </section>
        )}

        {/* ── Operational Runtime ──────────────────────────────────────── */}
        {!error && (
          <OperationalRuntime />
        )}

        {/* ── Recent activity ──────────────────────────────────────────── */}
        {recentLogs.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-[#3a3a3a] uppercase tracking-wider mb-3">Recent Activity</h3>
            <div className="space-y-1.5">
              {recentLogs.map(log => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 text-xs bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2 hover:border-[#222] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.status === 'completed' ? 'bg-[#22c55e]' :
                    log.status === 'failed'    ? 'bg-red-500'   : 'bg-[#f59e0b]'
                  }`} />
                  <span className="text-[#525252] font-mono text-[10px] shrink-0">{log.action_type}</span>
                  <span className="flex-1 truncate text-[#737373]">{log.summary}</span>
                  <span className="shrink-0 text-[10px] text-[#3a3a3a] tabular-nums">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
