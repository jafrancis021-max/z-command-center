'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type {
  Project, Task, Decision, Note, Prompt, Handover,
  Blocker, ArchitectureRule, Document,
} from '@/types'
import {
  getProject, getTasks, getDecisions, getNotes, getPrompts, getHandovers,
  createTask, updateTaskStatus, deleteTask, createDecision, createNote,
  getBlockers, getArchitectureRules, createArchitectureRule, deleteArchitectureRule,
  getDocuments, updateProjectState,
} from '@/lib/supabase'
import ZChatPanel from '@/components/ZChatPanel'
import AddModal from '@/components/AddModal'
import MemoryTab from '@/components/MemoryTab'
import TimelineTab from '@/components/TimelineTab'
import ClaudeSessionTab from '@/components/ClaudeSessionTab'
import WeeklyReportWidget from '@/components/WeeklyReportWidget'
import WorkflowsTab from '@/components/WorkflowsTab'

type TabKey = 'overview' | 'tasks' | 'blockers' | 'architecture' | 'decisions' | 'notes' | 'documents' | 'memory' | 'timeline' | 'sessions' | 'reports' | 'workflows' | 'prompts' | 'handovers'

const STATUS_COLORS: Record<string, string> = {
  todo: 'text-[#737373] bg-[#737373]/10 border-[#737373]/20',
  doing: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  blocked: 'text-red-400 bg-red-500/10 border-red-500/20',
  done: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
}
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-[#f59e0b]', low: 'bg-[#525252]',
}
const SEVERITY_COLORS: Record<string, string> = {
  low: 'text-[#737373] bg-[#737373]/10 border-[#737373]/20',
  medium: 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  critical: 'text-red-500 bg-red-500/15 border-red-500/30',
}
const RISK_COLORS: Record<string, string> = {
  low: 'text-[#22c55e]', medium: 'text-[#f59e0b]', high: 'text-red-400', critical: 'text-red-500',
}

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [archRules, setArchRules] = useState<ArchitectureRule[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [modal, setModal] = useState<'task' | 'decision' | 'note' | 'blocker' | 'arch' | null>(null)
  const [generating, setGenerating] = useState<'prompt' | 'handover' | null>(null)
  const [generatedContent, setGeneratedContent] = useState<string | null>(null)

  // Overview edit state
  const [editingOverview, setEditingOverview] = useState(false)
  const [overviewDraft, setOverviewDraft] = useState({
    current_phase: '', current_status: '', main_blocker: '',
    next_step: '', risk_level: 'low' as Project['risk_level'], last_success: '',
  })
  const [savingOverview, setSavingOverview] = useState(false)

  // Document upload state
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const proj = await getProject(id)
    if (!proj) { router.push('/dashboard'); return }
    const [t, d, n, p, h, b, ar, docs] = await Promise.all([
      getTasks(id), getDecisions(id), getNotes(id),
      getPrompts(id), getHandovers(id),
      getBlockers(id), getArchitectureRules(id), getDocuments(id),
    ])
    setProject(proj)
    setOverviewDraft({
      current_phase: proj.current_phase ?? '',
      current_status: proj.current_status ?? '',
      main_blocker: proj.main_blocker ?? '',
      next_step: proj.next_step ?? '',
      risk_level: proj.risk_level ?? 'low',
      last_success: proj.last_success ?? '',
    })
    setTasks(t); setDecisions(d); setNotes(n); setPrompts(p); setHandovers(h)
    setBlockers(b); setArchRules(ar); setDocuments(docs)
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function handleGenerate(type: 'prompt' | 'handover') {
    setGenerating(type)
    setGeneratedContent(null)
    try {
      const endpoint = type === 'prompt' ? '/api/generate-prompt' : '/api/generate-handover'
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedContent(type === 'prompt' ? data.prompt : data.handover)
      await load()
    } catch (e) {
      setGeneratedContent(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally { setGenerating(null) }
  }

  async function handleSaveOverview() {
    if (!project) return
    setSavingOverview(true)
    try {
      await updateProjectState(id, overviewDraft)
      setProject(prev => prev ? { ...prev, ...overviewDraft } : prev)
      setEditingOverview(false)
    } catch { /* ignore */ }
    finally { setSavingOverview(false) }
  }

  async function handleResolveBlocker(blockerId: string) {
    try {
      const res = await fetch('/api/blockers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: blockerId, status: 'resolved' }),
      })
      if (res.ok) {
        setBlockers(prev => prev.filter(b => b.id !== blockerId))
      }
    } catch { /* ignore */ }
  }

  async function handleAddBlocker(values: Record<string, string>) {
    const res = await fetch('/api/blockers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: id, title: values.title, description: values.description, severity: values.severity }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setBlockers(prev => [data.blocker, ...prev])
  }

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', id)
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDocuments(prev => [data.document, ...prev])
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingDoc(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-[#f59e0b]/60 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!project) return null

  const openBlockers = blockers.filter(b => b.status !== 'resolved')

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: `Tasks (${tasks.filter(t => t.status !== 'done').length})` },
    { key: 'blockers', label: `Blockers${openBlockers.length ? ` (${openBlockers.length})` : ''}` },
    { key: 'architecture', label: `Architecture (${archRules.length})` },
    { key: 'decisions', label: `Decisions (${decisions.length})` },
    { key: 'notes', label: `Notes (${notes.length})` },
    { key: 'documents', label: `Documents (${documents.length})` },
    { key: 'memory', label: 'Memory' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'reports', label: 'Reports' },
    { key: 'workflows', label: 'Workflows' },
    { key: 'prompts', label: `Prompts (${prompts.length})` },
    { key: 'handovers', label: `Handovers (${handovers.length})` },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-6 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="text-[#525252] hover:text-[#a3a3a3] transition-colors text-sm shrink-0">
          ← Dashboard
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[#e5e5e5]">{project.name}</h1>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              project.status === 'active' ? 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20' :
              project.status === 'paused' ? 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20' :
              'text-[#525252] bg-[#525252]/10 border-[#525252]/20'
            }`}>{project.status}</span>
            {project.risk_level && project.risk_level !== 'low' && (
              <span className={`text-[10px] font-medium ${RISK_COLORS[project.risk_level]}`}>
                risk:{project.risk_level}
              </span>
            )}
            {openBlockers.length > 0 && (
              <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                {openBlockers.length} blocker{openBlockers.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-[#525252] truncate max-w-xl">{project.description}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={() => setModal('task')}
            className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
            + Task
          </button>
          <button onClick={() => setModal('blocker')}
            className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-red-500/40 hover:text-red-400 transition-colors">
            + Blocker
          </button>
          <button onClick={() => setModal('decision')}
            className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
            + Decision
          </button>
          <button onClick={() => setModal('note')}
            className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors">
            + Note
          </button>
          <button onClick={() => handleGenerate('prompt')} disabled={!!generating}
            className="text-xs border border-[#f59e0b]/30 text-[#f59e0b] px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors disabled:opacity-50">
            {generating === 'prompt' ? '⏳' : '⚡'} Prompt
          </button>
          <button onClick={() => handleGenerate('handover')} disabled={!!generating}
            className="text-xs border border-[#f59e0b]/30 text-[#f59e0b] px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors disabled:opacity-50">
            {generating === 'handover' ? '⏳' : '📋'} Handover
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Generated content banner */}
          {generatedContent && (
            <div className="m-4 mb-0 bg-[#111] border border-[#f59e0b]/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#f59e0b] font-medium">Generated</span>
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(generatedContent)}
                    className="text-xs text-[#525252] hover:text-[#a3a3a3]">Copy</button>
                  <button onClick={() => setGeneratedContent(null)}
                    className="text-xs text-[#525252] hover:text-[#a3a3a3]">✕</button>
                </div>
              </div>
              <pre className="text-xs text-[#737373] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
                {generatedContent}
              </pre>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-0 px-4 pt-4 border-b border-[#1a1a1a] pb-0 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`text-xs px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'text-[#f59e0b] border-b-2 border-[#f59e0b] -mb-px'
                    : 'text-[#525252] hover:text-[#a3a3a3]'
                }${tab.key === 'blockers' && openBlockers.length > 0 ? ' text-red-400!' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">

            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#525252] uppercase tracking-wider">Operator State</span>
                  {!editingOverview ? (
                    <button onClick={() => setEditingOverview(true)}
                      className="text-xs text-[#525252] hover:text-[#a3a3a3] border border-[#2a2a2a] px-2 py-1 rounded transition-colors">
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingOverview(false); setOverviewDraft({ current_phase: project.current_phase ?? '', current_status: project.current_status ?? '', main_blocker: project.main_blocker ?? '', next_step: project.next_step ?? '', risk_level: project.risk_level ?? 'low', last_success: project.last_success ?? '' }) }}
                        className="text-xs text-[#525252] hover:text-[#a3a3a3] px-2 py-1 rounded transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleSaveOverview} disabled={savingOverview}
                        className="text-xs bg-[#f59e0b] text-black font-medium px-3 py-1 rounded transition-colors disabled:opacity-50">
                        {savingOverview ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { key: 'current_phase', label: 'Current Phase', placeholder: 'e.g. Phase 2 — Backend' },
                    { key: 'current_status', label: 'Current Status', placeholder: 'e.g. Building auth flow' },
                    { key: 'next_step', label: 'Next Step', placeholder: 'Specific next action' },
                    { key: 'main_blocker', label: 'Main Blocker', placeholder: 'What is blocking progress?' },
                    { key: 'last_success', label: 'Last Success', placeholder: 'Most recent win' },
                  ].map(field => (
                    <div key={field.key} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-3">
                      <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">{field.label}</p>
                      {editingOverview ? (
                        <input
                          value={overviewDraft[field.key as keyof typeof overviewDraft] as string}
                          onChange={e => setOverviewDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                          placeholder={field.placeholder}
                          className="w-full bg-transparent text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none"
                        />
                      ) : (
                        <p className="text-xs text-[#e5e5e5]">
                          {(project[field.key as keyof Project] as string) || <span className="text-[#525252]">Not set</span>}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="bg-[#111] border border-[#1e1e1e] rounded-lg p-3">
                    <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1">Risk Level</p>
                    {editingOverview ? (
                      <select
                        value={overviewDraft.risk_level ?? 'low'}
                        onChange={e => setOverviewDraft(prev => ({ ...prev, risk_level: e.target.value as Project['risk_level'] }))}
                        className="w-full bg-transparent text-xs text-[#e5e5e5] focus:outline-none"
                      >
                        {['low','medium','high','critical'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <p className={`text-xs font-medium ${RISK_COLORS[project.risk_level ?? 'low']}`}>
                        {project.risk_level ?? 'low'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Active blockers preview */}
                {openBlockers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-[#525252] uppercase tracking-wider">Open Blockers</p>
                    {openBlockers.slice(0, 3).map(b => (
                      <div key={b.id} className="flex items-center gap-2 bg-[#111] border border-red-500/20 rounded-lg px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[b.severity]}`}>{b.severity}</span>
                        <span className="text-xs text-[#e5e5e5] flex-1">{b.title}</span>
                        <button onClick={() => setActiveTab('blockers')}
                          className="text-[10px] text-[#525252] hover:text-[#a3a3a3]">view →</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Project stats */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Active Tasks', value: tasks.filter(t => t.status === 'doing').length, color: 'text-[#f59e0b]' },
                    { label: 'Blocked', value: tasks.filter(t => t.status === 'blocked').length, color: 'text-red-400' },
                    { label: 'Todo', value: tasks.filter(t => t.status === 'todo').length, color: 'text-[#a3a3a3]' },
                    { label: 'Done', value: tasks.filter(t => t.status === 'done').length, color: 'text-[#22c55e]' },
                  ].map(s => (
                    <div key={s.label} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-3 text-center">
                      <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-[#525252]">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TASKS ── */}
            {activeTab === 'tasks' && (
              <>
                {tasks.length === 0 && <Empty label="No tasks yet" action={() => setModal('task')} actionLabel="Add first task" />}
                {(['doing', 'blocked', 'todo', 'done'] as const).map(status => {
                  const group = tasks.filter(t => t.status === status)
                  if (!group.length) return null
                  return (
                    <div key={status} className="mb-4">
                      <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">{status} ({group.length})</p>
                      <div className="space-y-1.5">
                        {group.map(task => (
                          <div key={task.id}
                            className="bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2.5 flex items-start gap-3 hover:border-[#2a2a2a] transition-colors group">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium ${status === 'done' ? 'line-through text-[#525252]' : 'text-[#e5e5e5]'}`}>
                                {task.title}
                              </p>
                              {task.description && <p className="text-[10px] text-[#525252] mt-0.5 truncate">{task.description}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_COLORS[task.status]}`}>{task.status}</span>
                              <select
                                value={task.status}
                                onChange={async e => {
                                  await updateTaskStatus(task.id, e.target.value)
                                  setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: e.target.value as Task['status'] } : t))
                                }}
                                className="text-[10px] bg-transparent text-[#525252] border border-transparent hover:border-[#2a2a2a] rounded px-1 py-0.5 focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                {['todo','doing','blocked','done'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button
                                onClick={async () => { await deleteTask(task.id); setTasks(prev => prev.filter(t => t.id !== task.id)) }}
                                className="text-[10px] text-[#525252] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* ── BLOCKERS ── */}
            {activeTab === 'blockers' && (
              <>
                {openBlockers.length === 0 && (
                  <Empty label="No open blockers" action={() => setModal('blocker')} actionLabel="Add blocker" />
                )}
                {openBlockers.map(b => (
                  <div key={b.id}
                    className="bg-[#111] border border-red-500/20 rounded-lg px-4 py-3 flex items-start gap-3 hover:border-red-500/30 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[b.severity]}`}>{b.severity}</span>
                        <p className="text-xs font-medium text-[#e5e5e5]">{b.title}</p>
                      </div>
                      {b.description && <p className="text-[10px] text-[#525252]">{b.description}</p>}
                      <p className="text-[10px] text-[#525252] mt-1">{new Date(b.created_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => handleResolveBlocker(b.id)}
                      className="text-[10px] text-[#525252] hover:text-[#22c55e] border border-transparent hover:border-[#22c55e]/30 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all">
                      Resolve
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* ── ARCHITECTURE ── */}
            {activeTab === 'architecture' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[#525252]">Immutable constraints and rules for this project</p>
                  <button onClick={() => setModal('arch')}
                    className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-2 py-1 rounded hover:bg-[#f59e0b]/10 transition-colors">
                    + Rule
                  </button>
                </div>
                {archRules.length === 0 && (
                  <div className="text-center py-12 text-[#525252]">
                    <p className="text-sm mb-3">No architecture rules yet</p>
                    <button onClick={() => setModal('arch')}
                      className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors">
                      Add first rule
                    </button>
                  </div>
                )}
                {Object.entries(
                  archRules.reduce((acc, rule) => {
                    const cat = rule.category || 'general'
                    if (!acc[cat]) acc[cat] = []
                    acc[cat].push(rule)
                    return acc
                  }, {} as Record<string, ArchitectureRule[]>)
                ).map(([category, rules]) => (
                  <div key={category} className="mb-4">
                    <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">{category}</p>
                    <div className="space-y-1.5">
                      {rules.map(rule => (
                        <div key={rule.id}
                          className="bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-2.5 flex items-center gap-3 group hover:border-[#2a2a2a] transition-colors">
                          <div className="w-1 h-1 rounded-full bg-[#f59e0b] shrink-0" />
                          <p className="text-xs text-[#e5e5e5] flex-1">{rule.rule}</p>
                          <button
                            onClick={async () => { await deleteArchitectureRule(rule.id); setArchRules(prev => prev.filter(r => r.id !== rule.id)) }}
                            className="text-[10px] text-[#525252] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ── DECISIONS ── */}
            {activeTab === 'decisions' && (
              <>
                {decisions.length === 0 && <Empty label="No decisions recorded" action={() => setModal('decision')} actionLabel="Add first decision" />}
                {decisions.map(d => (
                  <div key={d.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-3 hover:border-[#2a2a2a] transition-colors">
                    <p className="text-xs text-[#e5e5e5] leading-relaxed">{d.decision}</p>
                    <p className="text-[10px] text-[#525252] mt-1">{new Date(d.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </>
            )}

            {/* ── NOTES ── */}
            {activeTab === 'notes' && (
              <>
                {notes.length === 0 && <Empty label="No notes yet" action={() => setModal('note')} actionLabel="Add first note" />}
                {notes.map(n => (
                  <div key={n.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-3 hover:border-[#2a2a2a] transition-colors">
                    <p className="text-xs text-[#a3a3a3] leading-relaxed whitespace-pre-wrap">{n.note}</p>
                    <p className="text-[10px] text-[#525252] mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </>
            )}

            {/* ── DOCUMENTS ── */}
            {activeTab === 'documents' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-[#525252]">Upload .txt or .md files — Z will summarize and index them</p>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md"
                      onChange={handleUploadDoc}
                      className="hidden"
                      id="doc-upload"
                    />
                    <label
                      htmlFor="doc-upload"
                      className={`text-xs border px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        uploadingDoc
                          ? 'border-[#2a2a2a] text-[#525252] pointer-events-none'
                          : 'border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/10'
                      }`}
                    >
                      {uploadingDoc ? 'Uploading...' : '+ Upload'}
                    </label>
                  </div>
                </div>
                {uploadError && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-2">
                    ⚠️ {uploadError}
                  </div>
                )}
                {documents.length === 0 && !uploadingDoc && (
                  <Empty label="No documents uploaded yet" action={() => fileInputRef.current?.click()} actionLabel="Upload first document" />
                )}
                {documents.map(doc => (
                  <div key={doc.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4 hover:border-[#2a2a2a] transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded">
                          .{doc.file_type}
                        </span>
                        <span className="text-xs font-medium text-[#e5e5e5]">{doc.file_name}</span>
                      </div>
                      <span className="text-[10px] text-[#525252]">{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                    {doc.summary ? (
                      <p className="text-xs text-[#737373] leading-relaxed whitespace-pre-wrap">
                        {doc.summary.slice(0, 300)}{doc.summary.length > 300 ? '...' : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-[#525252] italic">No summary yet</p>
                    )}
                    <p className="text-[10px] text-[#525252] mt-2">
                      Ask Z in the chat panel to summarize or answer questions about this document.
                    </p>
                  </div>
                ))}
              </>
            )}

            {/* ── MEMORY ── */}
            {activeTab === 'memory' && (
              <MemoryTab projectId={id} />
            )}

            {/* ── TIMELINE ── */}
            {activeTab === 'timeline' && (
              <TimelineTab projectId={id} />
            )}

            {/* ── SESSIONS ── */}
            {activeTab === 'sessions' && (
              <ClaudeSessionTab projectId={id} />
            )}

            {/* ── REPORTS ── */}
            {activeTab === 'reports' && project && (
              <WeeklyReportWidget projectId={id} projectName={project.name} />
            )}

            {/* ── PROMPTS ── */}
            {activeTab === 'prompts' && (
              <>
                {prompts.length === 0 && (
                  <Empty label="No prompts generated yet" action={() => handleGenerate('prompt')} actionLabel="Generate first prompt" />
                )}
                {prompts.map(p => (
                  <div key={p.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4 hover:border-[#2a2a2a] transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-[#f59e0b] uppercase tracking-wider">{p.prompt_type}</span>
                      <div className="flex gap-2">
                        <span className="text-[10px] text-[#525252]">{new Date(p.created_at).toLocaleDateString()}</span>
                        <button onClick={() => navigator.clipboard.writeText(p.content)}
                          className="text-[10px] text-[#525252] hover:text-[#a3a3a3]">Copy</button>
                      </div>
                    </div>
                    <pre className="text-xs text-[#737373] whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
                      {p.content}
                    </pre>
                  </div>
                ))}
              </>
            )}

            {/* ── WORKFLOWS ── */}
            {activeTab === 'workflows' && (
              <WorkflowsTab projectId={id} />
            )}

            {/* ── HANDOVERS ── */}
            {activeTab === 'handovers' && (
              <>
                {handovers.length === 0 && (
                  <Empty label="No handovers yet" action={() => handleGenerate('handover')} actionLabel="Generate first handover" />
                )}
                {handovers.map(h => (
                  <div key={h.id} className="bg-[#111] border border-[#1e1e1e] rounded-lg p-4 hover:border-[#2a2a2a] transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-[#f59e0b] uppercase tracking-wider">Handover</span>
                      <div className="flex gap-2">
                        <span className="text-[10px] text-[#525252]">{new Date(h.created_at).toLocaleDateString()}</span>
                        <button onClick={() => navigator.clipboard.writeText(h.content)}
                          className="text-[10px] text-[#525252] hover:text-[#a3a3a3]">Copy</button>
                      </div>
                    </div>
                    <pre className="text-xs text-[#737373] whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed">
                      {h.content}
                    </pre>
                  </div>
                ))}
              </>
            )}

          </div>
        </div>

        {/* Z Chat Panel */}
        <div className="w-[360px] shrink-0 border-l border-[#1a1a1a] p-4">
          <div className="h-full">
            <ZChatPanel projectId={id} projectName={project.name} />
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === 'task' && (
        <AddModal
          title="Add Task"
          fields={[
            { key: 'title', label: 'Title', type: 'text', placeholder: 'Task title', required: true },
            { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional details' },
            { key: 'priority', label: 'Priority', type: 'select', options: [
              { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
            ]},
          ]}
          onSubmit={async values => {
            const task = await createTask(id, values.title, values.description, values.priority)
            setTasks(prev => [task, ...prev])
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'blocker' && (
        <AddModal
          title="Add Blocker"
          fields={[
            { key: 'title', label: 'Title', type: 'text', placeholder: 'What is blocking progress?', required: true },
            { key: 'description', label: 'Description', type: 'textarea', placeholder: 'More details (optional)' },
            { key: 'severity', label: 'Severity', type: 'select', options: [
              { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' },
              { value: 'critical', label: 'Critical' }, { value: 'low', label: 'Low' },
            ]},
          ]}
          onSubmit={handleAddBlocker}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'decision' && (
        <AddModal
          title="Record Decision"
          fields={[
            { key: 'decision', label: 'Decision', type: 'textarea', placeholder: 'What was decided and why?', required: true },
          ]}
          onSubmit={async values => {
            const dec = await createDecision(id, values.decision)
            setDecisions(prev => [dec, ...prev])
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'note' && (
        <AddModal
          title="Add Note"
          fields={[
            { key: 'note', label: 'Note', type: 'textarea', placeholder: 'Any relevant context, observations, or reminders', required: true },
          ]}
          onSubmit={async values => {
            const note = await createNote(id, values.note)
            setNotes(prev => [note, ...prev])
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'arch' && (
        <AddModal
          title="Add Architecture Rule"
          fields={[
            { key: 'rule', label: 'Rule', type: 'textarea', placeholder: 'e.g. Never expose API keys client-side', required: true },
            { key: 'category', label: 'Category', type: 'select', options: [
              { value: 'security', label: 'Security' }, { value: 'api', label: 'API' },
              { value: 'data', label: 'Data' }, { value: 'ui', label: 'UI' },
              { value: 'deployment', label: 'Deployment' }, { value: 'general', label: 'General' },
            ]},
          ]}
          onSubmit={async values => {
            const rule = await createArchitectureRule(id, values.rule, values.category || 'general')
            setArchRules(prev => [...prev, rule])
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function Empty({ label, action, actionLabel }: { label: string; action: () => void; actionLabel: string }) {
  return (
    <div className="text-center py-12 text-[#525252]">
      <p className="text-sm mb-3">{label}</p>
      <button onClick={action}
        className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors">
        {actionLabel}
      </button>
    </div>
  )
}
