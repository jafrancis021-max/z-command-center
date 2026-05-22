'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function SignupPage() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName || !email || !password) return
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')

    try {
      const supabase = getSupabase()
      const { data, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      })
      if (authErr) throw authErr

      const session = data.session
      if (session) {
        // Immediately set session and create profile
        const res = await fetch('/api/auth/session', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            access_token: session.access_token,
            full_name:    fullName,
          }),
        })
        if (!res.ok) throw new Error('Failed to establish session')
        router.replace('/launch-checklist')
      } else {
        // Email confirmation required
        router.replace('/auth/confirm?email=' + encodeURIComponent(email))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#F7F8FA] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center text-white font-bold text-[15px] shadow-[0_2px_12px_rgba(37,99,235,0.3)]">
            Z
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-800">Command Center</p>
            <p className="text-[9.5px] text-gray-400">Operational Intelligence Platform</p>
          </div>
        </div>

        <h1 className="text-[22px] font-bold text-gray-900 mb-1">Create your workspace</h1>
        <p className="text-[12px] text-gray-400 mb-6">Get your operation connected in minutes</p>

        <form onSubmit={handleSignup} className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="James Francis"
              required
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Work Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !fullName || !email || !password}
            className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40 mt-1"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Creating workspace…
              </span>
            ) : 'Create workspace →'}
          </button>
        </form>

        <div className="mt-4">
          <p className="text-center text-[10px] text-gray-400 leading-relaxed">
            By signing up, you agree that Z stores your operational data securely in your workspace.
          </p>
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[10px] text-gray-300">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <p className="text-center text-[11px] text-gray-400">
          Already have a workspace?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
