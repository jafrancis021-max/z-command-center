'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { isWorkspaceMode, type WorkspaceMode } from '@/lib/workspace-state'
import { ASSISTANT_UI_CONTEXTS, type AssistantQuickAction } from '@/lib/assistant-ui-context'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface RuntimeWarning {
  source:  string
  level:   'severe' | 'mild'
  message: string
  hint?:   string
}

interface RuntimeStatus {
  status:   'healthy' | 'degraded' | 'critical'
  warnings: RuntimeWarning[]
}

interface UserProfile {
  full_name: string
  email: string
  checklist_progress?: Record<string, boolean>
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:10.5px;font-weight:700;color:#111827;margin:8px 0 3px;">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="font-size:11px;font-weight:700;color:#111827;margin:8px 0 3px;">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="font-size:12px;font-weight:700;color:#111827;margin:8px 0 4px;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,     '<code style="background:#F3F4F6;border:1px solid #E5E7EB;padding:1px 4px;border-radius:4px;font-size:9.5px;color:#2563EB">$1</code>')
    .replace(/^- (.+)$/gm,     '<li style="margin:1px 0;padding-left:2px">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, '<ul style="padding-left:12px;margin:4px 0">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:4px 0">')
    .split('\n').join('<br/>')
}

function AssistantMessage({ text }: { text: string }) {
  return (
    <div
      className="z-prose text-[10.5px] text-gray-600 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  )
}

// ── Greeting ──────────────────────────────────────────────────────────────────

function getGreeting(name: string): string {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const first = name?.split(' ')[0] ?? name
  return `Good ${time}, ${first}.`
}

// ── Setup progress keys ───────────────────────────────────────────────────────

const CHECKLIST_KEYS = [
  'connect_gmail', 'connect_calendar', 'upload_document', 'add_screenshot',
  'create_case', 'review_workflow', 'approve_action', 'open_timeline',
  'run_system_proof', 'verify_health',
]

// ── Generic START HERE actions (shown when not on /dashboard) ─────────────────

const START_HERE = [
  { href: '/connections', label: 'Connect Systems', color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'  },
  { href: '/vault',       label: 'Add to Vault',    color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'     },
  { href: '/cases',       label: 'Create Case',     color: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100' },
  { href: '/workflows',   label: 'Review Workflows',color: 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100' },
]

// ── TODAY'S FOCUS prompts ─────────────────────────────────────────────────────

const FOCUS_PROMPTS = [
  { icon: '🎯', text: 'What needs my attention today?' },
  { icon: '⚡', text: 'Show stalled workflows' },
  { icon: '📋', text: 'Summarize active cases' },
]

// ── In-conversation quick prompts ─────────────────────────────────────────────

const CHAT_QUICK = ['What next?', 'Active cases', 'Any blockers?', 'Show pressure']

// ── Mode badge ────────────────────────────────────────────────────────────────

const MODE_BADGE_COLOR: Partial<Record<WorkspaceMode, string>> = {
  vault_upload:        'text-blue-600 bg-blue-50 border-blue-200',
  workflow_run:        'text-violet-600 bg-violet-50 border-violet-200',
  events_view:         'text-green-600 bg-green-50 border-green-200',
  case_focus:          'text-amber-600 bg-amber-50 border-amber-200',
  memory_debug:        'text-rose-600 bg-rose-50 border-rose-200',
  runtime_health:      'text-teal-600 bg-teal-50 border-teal-200',
  operational_replay:  'text-orange-600 bg-orange-50 border-orange-200',
  procedural_patterns: 'text-teal-700 bg-teal-50 border-teal-200',
  workflow_learning:   'text-emerald-600 bg-emerald-50 border-emerald-200',
}

// ── Contextual quick actions ──────────────────────────────────────────────────

function WorkspaceQuickAction({
  action,
  onNavigate,
  onPrompt,
}: {
  action:      AssistantQuickAction
  onNavigate:  (mode: WorkspaceMode) => void
  onPrompt:    (text: string) => void
}) {
  if (action.href) {
    return (
      <Link
        href={action.href}
        className={`flex items-center justify-center px-2 py-2.5 rounded-lg border text-[9.5px] font-semibold transition-all text-center leading-snug ${action.color}`}
      >
        {action.label}
      </Link>
    )
  }
  return (
    <button
      onClick={() => {
        if (action.mode)   onNavigate(action.mode)
        if (action.prompt) onPrompt(action.prompt)
      }}
      className={`flex items-center justify-center px-2 py-2.5 rounded-lg border text-[9.5px] font-semibold transition-all text-center leading-snug ${action.color}`}
    >
      {action.label}
    </button>
  )
}

// ── Inner panel (uses useSearchParams — needs Suspense wrapper) ───────────────

function ZAssistantPanelInner() {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [profile,   setProfile]   = useState<UserProfile | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [runtime,   setRuntime]   = useState<RuntimeStatus | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Workspace context — only on /dashboard
  const isDashboard = pathname === '/dashboard'
  const rawWs       = isDashboard ? searchParams.get('ws') : null
  const activeMode: WorkspaceMode = (rawWs && isWorkspaceMode(rawWs)) ? rawWs : 'dashboard_home'
  const wsCtx       = isDashboard ? ASSISTANT_UI_CONTEXTS[activeMode] : null

  function navigateWorkspace(mode: WorkspaceMode) {
    if (mode === 'dashboard_home') {
      router.replace('/dashboard')
      return
    }
    router.replace(`/dashboard?ws=${mode}`)
  }

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: UserProfile | null) => { if (d) setProfile(d) })
      .catch(() => null)
  }, [])

  useEffect(() => {
    fetch('/api/debug/runtime')
      .then(r => r.ok ? r.json() : null)
      .then((d: RuntimeStatus | null) => { if (d) setRuntime(d) })
      .catch(() => null)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async (text?: string) => {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    const userMsg: Message = { role: 'user', content: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/assistant/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: newMessages, context: { path: pathname } }),
      })
      const data = await res.json() as { message?: string; error?: string }
      if (!res.ok) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message ?? '' }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, pathname])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }, [send])

  // Setup progress
  const setupDone     = CHECKLIST_KEYS.filter(k => profile?.checklist_progress?.[k]).length
  const setupPct      = profile ? Math.round((setupDone / CHECKLIST_KEYS.length) * 100) : 0
  const setupComplete = profile ? setupDone === CHECKLIST_KEYS.length : false

  if (collapsed) {
    return (
      <div className="hidden lg:flex fixed right-0 top-0 h-screen w-12 z-20 flex-col items-center pt-4 bg-white border-l border-gray-200">
        <button
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-[11px] font-bold hover:bg-blue-100 transition-colors"
          title="Open assistant"
        >
          Z
        </button>
        <div className="mt-3 w-px flex-1 bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="hidden lg:flex fixed right-0 top-0 h-screen w-72 z-20 flex-col bg-white border-l border-gray-200">

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-200 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white font-bold text-[12px] shrink-0">
          Z
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-800 leading-none">Operations Assistant</p>
          <div className="flex items-center gap-1.5 mt-[3px]">
            <span className="w-1 h-1 rounded-full bg-[#10B981] animate-pulse shrink-0" />
            <p className="text-[9px] text-gray-400">Always active</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-[8.5px] text-gray-300 hover:text-gray-500 transition-colors px-1.5 py-1"
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="text-[9px] text-gray-300 hover:text-gray-500 transition-colors p-1"
            title="Collapse assistant"
          >
            →
          </button>
        </div>
      </div>

      {/* ── Intelligence / Messages ── */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">

        {messages.length === 0 ? (

          /* ── Operational intelligence layer ── */
          <div className="p-4 space-y-5">

            {/* 1. Greeting + status */}
            <div>
              <p className="text-[17px] font-bold text-gray-900 leading-snug">
                {getGreeting(profile?.full_name ?? 'there')}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0 animate-pulse" />
                <p className="text-[9.5px] text-gray-500 font-medium">
                  Z is operational and monitoring your workspace
                </p>
              </div>
            </div>

            {/* 2. Runtime notice (only when degraded/critical) */}
            {runtime && runtime.status !== 'healthy' && runtime.warnings.length > 0 && (
              <div className={`rounded-xl border p-3 ${
                runtime.status === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-start gap-2">
                  <span className={`text-[11px] mt-0.5 shrink-0 ${runtime.status === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                    ⚠
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9.5px] font-semibold leading-snug ${runtime.status === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
                      {runtime.warnings[0].message}
                    </p>
                    {runtime.warnings.length > 1 && (
                      <p className={`text-[8.5px] mt-0.5 ${runtime.status === 'critical' ? 'text-red-500' : 'text-amber-500'}`}>
                        +{runtime.warnings.length - 1} more warning(s)
                      </p>
                    )}
                  </div>
                  <Link
                    href="/connections"
                    className={`text-[8.5px] font-semibold whitespace-nowrap shrink-0 ${runtime.status === 'critical' ? 'text-red-600 hover:text-red-700' : 'text-amber-600 hover:text-amber-700'}`}
                  >
                    View →
                  </Link>
                </div>
              </div>
            )}

            {/* 3. Setup progress (hidden when complete) */}
            {profile && !setupComplete && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em]">
                    Setup Progress
                  </p>
                  <span className="text-[9px] font-bold text-blue-600">{setupPct}%</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                    style={{ width: `${setupPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[8.5px] text-slate-400">{setupDone} of {CHECKLIST_KEYS.length} steps complete</p>
                  <Link href="/launch-checklist" className="text-[8.5px] text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                    Continue →
                  </Link>
                </div>
              </div>
            )}

            {/* 4. Workspace context (on /dashboard) OR generic Start here */}
            {wsCtx ? (
              <div>
                {/* Mode badge */}
                {activeMode !== 'dashboard_home' && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 text-[8.5px] font-semibold px-2 py-0.5 rounded-full border ${MODE_BADGE_COLOR[activeMode] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
                      <span className="w-1 h-1 rounded-full bg-current opacity-70" />
                      {wsCtx.title}
                    </span>
                  </div>
                )}

                <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-1">
                  {activeMode === 'dashboard_home' ? 'Quick actions' : wsCtx.title}
                </p>
                <p className="text-[9.5px] text-gray-500 leading-relaxed mb-2.5">
                  {wsCtx.guidance}
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  {wsCtx.quickActions.map(action => (
                    <WorkspaceQuickAction
                      key={action.label}
                      action={action}
                      onNavigate={navigateWorkspace}
                      onPrompt={text => { void send(text) }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2.5">
                  Start here
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {START_HERE.map(action => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className={`flex items-center justify-center px-2 py-2.5 rounded-lg border text-[9.5px] font-semibold transition-all text-center leading-snug ${action.color}`}
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Today's focus */}
            <div>
              <p className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] mb-2.5">
                Today&apos;s focus
              </p>
              <div className="space-y-1.5">
                {FOCUS_PROMPTS.map(p => (
                  <button
                    key={p.text}
                    onClick={() => { void send(p.text) }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[10.5px] font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <span className="text-[13px] shrink-0">{p.icon}</span>
                    {p.text}
                  </button>
                ))}
              </div>
            </div>

          </div>

        ) : (

          /* ── Conversation ── */
          <div className="p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-5 h-5 rounded bg-[#2563EB] flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5">
                    Z
                  </div>
                )}
                <div className={`max-w-[90%] ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-[10.5px] leading-relaxed'
                  : 'flex-1'
                }`}>
                  {msg.role === 'assistant'
                    ? <AssistantMessage text={msg.content} />
                    : <p>{msg.content}</p>
                  }
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-[#2563EB]/70 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                  Z
                </div>
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-blue-300 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

        )}
      </div>

      {/* ── Quick prompts (in conversation only) ── */}
      {messages.length > 0 && (
        <div className="px-3 pb-2 pt-1 flex gap-1 overflow-x-auto scrollbar-none shrink-0 border-t border-gray-100">
          {CHAT_QUICK.map(p => (
            <button
              key={p}
              onClick={() => { void send(p) }}
              disabled={loading}
              className="shrink-0 text-[8.5px] text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-4 pb-4 pt-3 border-t border-slate-200 bg-white shrink-0">
        <p className="text-[9px] text-slate-400 mb-2 leading-relaxed">
          Z can search, explain, build workflows, or guide your operation.
        </p>
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Z what to do next…"
            className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-3 text-[11px] text-slate-900 placeholder-slate-500 shadow-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-all min-h-[48px]"
          />
          <button
            onClick={() => { void send() }}
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors disabled:opacity-40 shrink-0 text-[15px] font-bold shadow-sm"
          >
            {loading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : '↑'}
          </button>
        </div>
      </div>

    </div>
  )
}

// ── Export — Suspense boundary required for useSearchParams ───────────────────

export default function ZAssistantPanel() {
  return (
    <Suspense fallback={
      <div className="hidden lg:flex fixed right-0 top-0 h-screen w-72 z-20 flex-col bg-white border-l border-gray-200">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-gray-200 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white font-bold text-[12px] shrink-0">
            Z
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-800 leading-none">Operations Assistant</p>
          </div>
        </div>
      </div>
    }>
      <ZAssistantPanelInner />
    </Suspense>
  )
}
