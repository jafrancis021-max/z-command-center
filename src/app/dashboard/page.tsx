import { getPendingApprovals } from '@/lib/supabase'
import GlobalSearch from '@/components/GlobalSearch'
import NotificationCenter from '@/components/NotificationCenter'
import WorkspaceController from '@/components/workspace/WorkspaceController'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let pendingApprovals = 0

  try {
    const approvals  = await getPendingApprovals(5)
    pendingApprovals = approvals.length
  } catch { /* non-fatal */ }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-20 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10B981]" />
          </span>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Command Center</p>
        </div>

        <div className="w-px h-4 bg-gray-200 shrink-0" />

        <div className="flex-1 flex justify-center">
          <GlobalSearch />
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {pendingApprovals > 0 && (
            <a
              href="/approvals"
              className="flex items-center gap-1.5 text-[9px] bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1.5 rounded-xl hover:bg-amber-100 transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-[#F59E0B] animate-pulse" />
              {pendingApprovals} pending
            </a>
          )}
          <NotificationCenter />
        </div>
      </header>

      {/* ── Workspace controller — client-side, reads ?ws= param ── */}
      <WorkspaceController />

    </div>
  )
}
