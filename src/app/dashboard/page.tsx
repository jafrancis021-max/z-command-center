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
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#f59e0b] flex items-center justify-center text-black font-bold text-sm">
            Z
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#e5e5e5] leading-none">Z Command Center</h1>
            <p className="text-[10px] text-[#525252]">Operational Intelligence</p>
          </div>
        </div>

        {/* Global search */}
        <div className="flex-1 flex justify-center max-w-md">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/workflows"
            className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
          >
            Workflows
          </Link>
          <Link
            href="/inbox"
            className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
          >
            Inbox
          </Link>
          <Link
            href="/approvals"
            className="relative text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
          >
            Approvals
            {pendingApprovals > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#f59e0b] text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingApprovals}
              </span>
            )}
          </Link>
          <span className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-2 py-0.5 rounded-full">
            v1.5
          </span>
        </div>
      </header>

      <main className="px-6 py-6 max-w-6xl mx-auto space-y-8">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            ⚠️ {error} — Check your Supabase environment variables.
          </div>
        )}

        {/* TODAY'S PRIORITIES — operational intelligence widget */}
        {!error && (
          <section>
            <TodaysPriorities />
          </section>
        )}

        {/* Stats row */}
        {!error && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
              <p className="text-2xl font-semibold text-[#e5e5e5]">{data.length}</p>
              <p className="text-xs text-[#525252] mt-1">Total Projects</p>
            </div>
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
              <p className="text-2xl font-semibold text-[#22c55e]">{activeProjects}</p>
              <p className="text-xs text-[#525252] mt-1">Active</p>
            </div>
            <Link
              href="/approvals"
              className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 hover:border-[#f59e0b]/30 transition-colors group"
            >
              <p className={`text-2xl font-semibold ${pendingApprovals > 0 ? 'text-[#f59e0b]' : 'text-[#e5e5e5]'}`}>
                {pendingApprovals}
              </p>
              <p className="text-xs text-[#525252] mt-1 group-hover:text-[#a3a3a3] transition-colors">
                Pending Approvals →
              </p>
            </Link>
            <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
              <p className="text-2xl font-semibold text-[#737373]">{recentLogs.length}</p>
              <p className="text-xs text-[#525252] mt-1">Recent Actions</p>
            </div>
          </div>
        )}

        {/* Cross-project intelligence */}
        {!error && data.length > 1 && (
          <section>
            <CrossProjectIntelligence />
          </section>
        )}

        {/* Projects */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#e5e5e5]">Projects</h2>
              <p className="text-xs text-[#525252]">Active operational workspaces</p>
            </div>
          </div>

          {!error && data.length === 0 && (
            <div className="text-center py-20 text-[#525252]">
              <div className="text-4xl mb-3">∅</div>
              <p className="text-sm">No projects found. Run the SQL schema in Supabase to seed initial projects.</p>
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

        {/* Operational Feed */}
        {!error && (
          <section>
            <OperationalFeed />
          </section>
        )}

        {/* Operational Runtime — scheduled job engine */}
        {!error && (
          <OperationalRuntime />
        )}

        {/* Recent activity */}
        {recentLogs.length > 0 && (
          <section>
            <h3 className="text-xs font-medium text-[#525252] uppercase tracking-wider mb-3">Recent Activity</h3>
            <div className="space-y-1.5">
              {recentLogs.map(log => (
                <div key={log.id}
                  className="flex items-center gap-3 text-xs text-[#525252] bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    log.status === 'completed' ? 'bg-[#22c55e]' :
                    log.status === 'failed' ? 'bg-red-500' : 'bg-[#f59e0b]'
                  }`} />
                  <span className="text-[#737373] font-mono">{log.action_type}</span>
                  <span className="flex-1 truncate">{log.summary}</span>
                  <span className="shrink-0 text-[10px]">
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
