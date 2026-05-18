'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TimelineEvent } from '@/types'

const EVENT_COLORS: Record<string, string> = {
  claude_success:      'bg-[#22c55e]',
  claude_failure:      'bg-red-500',
  blocker_added:       'bg-red-400',
  milestone:           'bg-[#f59e0b]',
  prompt_generated:    'bg-blue-400',
  handover_generated:  'bg-purple-400',
  document_uploaded:   'bg-cyan-400',
  memory_ingested:     'bg-indigo-400',
  architecture_change: 'bg-orange-400',
  note_added:          'bg-[#525252]',
  decision_made:       'bg-[#f59e0b]',
  task_completed:      'bg-[#22c55e]',
  task_blocked:        'bg-red-400',
}

const EVENT_LABELS: Record<string, string> = {
  claude_success:      'Claude Success',
  claude_failure:      'Claude Failure',
  blocker_added:       'Blocker Added',
  milestone:           'Milestone',
  prompt_generated:    'Prompt Generated',
  handover_generated:  'Handover',
  document_uploaded:   'Doc Uploaded',
  memory_ingested:     'Memory Ingested',
  architecture_change: 'Arch Change',
  note_added:          'Note',
  decision_made:       'Decision',
  task_completed:      'Task Done',
  task_blocked:        'Task Blocked',
}

const ALL_EVENT_TYPES = [
  'milestone', 'claude_success', 'claude_failure', 'blocker_added',
  'prompt_generated', 'handover_generated', 'document_uploaded',
  'memory_ingested', 'architecture_change', 'decision_made', 'note_added',
]

interface Props {
  projectId: string
}

export default function TimelineTab({ projectId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ event_type: 'milestone', title: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/timeline?project_id=${projectId}`)
      const data = await res.json()
      setEvents(data.events ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!form.title.trim()) { setError('Title required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => [data.event, ...prev])
      setShowForm(false)
      setForm({ event_type: 'milestone', title: '', description: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  // Group events by date
  const grouped = events.reduce<Record<string, TimelineEvent[]>>((acc, e) => {
    const date = new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!acc[date]) acc[date] = []
    acc[date].push(e)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex gap-1">
          {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#525252]">{events.length} event{events.length !== 1 ? 's' : ''} recorded</p>
        <button
          onClick={() => { setShowForm(!showForm); setError('') }}
          className="text-xs border border-[#2a2a2a] text-[#a3a3a3] px-3 py-1.5 rounded-lg hover:border-[#f59e0b]/40 hover:text-[#f59e0b] transition-colors"
        >
          + Add Event
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          ⚠️ {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 space-y-3">
          <div>
            <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Event Type</label>
            <select
              value={form.event_type}
              onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] focus:outline-none focus:border-[#f59e0b]/40"
            >
              {ALL_EVENT_TYPES.map(t => (
                <option key={t} value={t}>{EVENT_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Phase 6C upsert fix deployed"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Optional details"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-xs bg-[#f59e0b] text-black font-semibold px-4 py-2 rounded-lg hover:bg-[#d97706] transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Event'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError('') }}
              className="text-xs border border-[#2a2a2a] text-[#525252] px-4 py-2 rounded-lg hover:text-[#a3a3a3] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="text-center py-12 text-[#525252]">
          <p className="text-sm mb-3">No timeline events yet</p>
          <button onClick={() => setShowForm(true)} className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors">
            Record first milestone
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, dateEvents]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-[#1a1a1a]" />
              <span className="text-[10px] text-[#525252] shrink-0">{date}</span>
              <div className="h-px flex-1 bg-[#1a1a1a]" />
            </div>
            <div className="space-y-2 relative pl-5">
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-[#1a1a1a]" />
              {dateEvents.map(event => (
                <div key={event.id} className="relative bg-[#111] border border-[#1e1e1e] rounded-lg px-4 py-3 hover:border-[#2a2a2a] transition-colors">
                  <div className={`absolute -left-[13px] top-4 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0a] ${EVENT_COLORS[event.event_type] ?? 'bg-[#525252]'}`} />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          event.event_type.includes('success') ? 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20' :
                          event.event_type.includes('fail') || event.event_type.includes('block') ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                          event.event_type === 'milestone' ? 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20' :
                          'text-[#525252] bg-[#525252]/10 border-[#525252]/20'
                        }`}>
                          {EVENT_LABELS[event.event_type] ?? event.event_type}
                        </span>
                        <p className="text-xs font-medium text-[#e5e5e5]">{event.title}</p>
                      </div>
                      {event.description && (
                        <p className="text-xs text-[#737373] leading-relaxed">{event.description}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-[#525252] shrink-0">
                      {new Date(event.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
