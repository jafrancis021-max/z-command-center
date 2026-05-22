import Link from 'next/link'
import { getPendingApprovals } from '@/lib/supabase'
import GlobalSearch from '@/components/GlobalSearch'
import NotificationCenter from '@/components/NotificationCenter'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let pendingApprovals = 0
  let error = ''

  try {
    const approvals  = await getPendingApprovals(5)
    pendingApprovals = approvals.length
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load'
  }

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
            <Link
              href="/approvals"
              className="flex items-center gap-1.5 text-[9px] bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1.5 rounded-xl hover:bg-amber-100 transition-colors"
            >
              <span className="w-1 h-1 rounded-full bg-[#F59E0B] animate-pulse" />
              {pendingApprovals} pending
            </Link>
          )}
          <NotificationCenter />
        </div>
      </header>

      {/* ── Center canvas ── */}
      <main className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">

        {error && (
          <div className="flex items-center gap-3 p-4 mb-8 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-[11px] max-w-sm w-full">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
            {error} — Check Supabase environment variables.
          </div>
        )}

        <div className="text-center max-w-sm">
          <h1 className="text-[22px] font-bold text-gray-900 mb-2">Z Command Center</h1>
          <p className="text-[13px] text-gray-400 leading-relaxed mb-6">
            Choose a workspace from the left, or ask Z to guide your operation.
          </p>
          <Link
            href="/launch-checklist"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-[11.5px] font-semibold rounded-xl hover:border-gray-300 hover:shadow-sm transition-all"
          >
            Open Launch Checklist
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

      </main>
    </div>
  )
}
