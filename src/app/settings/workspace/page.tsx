'use client'

import { useEffect, useState } from 'react'

interface Profile {
  full_name?: string
  email?: string
}

export default function WorkspaceSettingsPage() {
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: Profile | null) => { if (d) setProfile(d) })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-xl mx-auto px-6 py-10">

        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="4" width="16" height="12" rx="1.5" />
              <path d="M5 9h10M5 12.5h6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-gray-900 leading-none">Workspace</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Workspace configuration</p>
          </div>
        </div>

        {/* Member info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm mb-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Account</p>
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse w-40" />
              <div className="h-4 bg-gray-100 rounded animate-pulse w-56" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-400">Name</p>
                <p className="text-[11px] font-medium text-gray-700">{profile?.full_name ?? '—'}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-400">Email</p>
                <p className="text-[11px] font-medium text-gray-700">{profile?.email ?? '—'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Workspace info */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Workspace</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-gray-400">Platform</p>
              <p className="text-[11px] font-medium text-gray-700">Z Command Center</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-gray-400">Plan</p>
              <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded leading-none">
                Operational
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-gray-400">Status</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <p className="text-[11px] font-medium text-[#10B981]">Active</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[9px] text-gray-300 text-center mt-8">
          Advanced workspace settings coming soon
        </p>
      </div>
    </div>
  )
}
