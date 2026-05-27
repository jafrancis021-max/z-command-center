'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ConfirmContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? 'your email'

  return (
    <div className="fixed inset-0 z-50 bg-[#F7F8FA] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-7 h-7 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M2 8l10 7 10-7" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-[22px] font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-[12px] text-gray-400 mb-6 leading-relaxed">
          We sent a confirmation link to <span className="font-semibold text-gray-600">{email}</span>.
          Click the link to activate your workspace.
        </p>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 text-left mb-6">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">What happens next</p>
          <div className="space-y-2">
            {[
              'Click the link in your email',
              'You\'ll be signed in automatically',
              'Your assistant will greet you by name',
              'Follow the Launch Checklist to connect your operation',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-4 h-4 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-[8px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <p className="text-[10.5px] text-gray-500">{step}</p>
              </div>
            ))}
          </div>
        </div>

        <Link href="/auth/login" className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors">
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmContent />
    </Suspense>
  )
}
