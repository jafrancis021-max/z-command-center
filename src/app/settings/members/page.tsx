'use client'

export default function MembersPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-xl mx-auto px-6 py-10">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="7.5" cy="7" r="3" />
              <path d="M1.5 17c0-3.3 2.7-6 6-6" strokeLinecap="round" />
              <circle cx="14" cy="7" r="2.5" />
              <path d="M17.5 17c0-2.5-1.6-4.5-3.5-5.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 leading-none">Members</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Workspace membership management</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
          <p className="text-[32px] mb-4">👥</p>
          <p className="text-[13px] font-semibold text-gray-700 mb-2">Member Management</p>
          <p className="text-[11px] text-gray-400 leading-relaxed max-w-xs mx-auto">
            Invite team members, manage roles, and control workspace access. Available in an upcoming release.
          </p>
        </div>

        <p className="text-[9px] text-gray-300 text-center mt-8">
          Currently operating as single-member workspace
        </p>
      </div>
    </div>
  )
}
