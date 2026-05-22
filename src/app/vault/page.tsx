'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VaultDoc {
  id: string
  original_name: string
  file_type: string
  source: string
  status: string
  detected_category: string
  extracted_summary?: string
  created_at: string
  case_id?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  contract:    'bg-blue-50 border-blue-200 text-blue-700',
  evidence:    'bg-violet-50 border-violet-200 text-violet-700',
  screenshot:  'bg-indigo-50 border-indigo-200 text-indigo-700',
  note:        'bg-amber-50 border-amber-200 text-amber-700',
  report:      'bg-green-50 border-green-200 text-green-700',
  legal:       'bg-red-50 border-red-200 text-red-700',
  financial:   'bg-emerald-50 border-emerald-200 text-emerald-700',
}

function categoryStyle(cat: string) {
  return CATEGORY_COLORS[cat?.toLowerCase()] ?? 'bg-gray-100 border-gray-200 text-gray-600'
}

function fileIcon(type: string) {
  if (type === 'note') return '📝'
  if (type?.startsWith('image')) return '🖼️'
  if (type === 'application/pdf' || type === 'pdf') return '📄'
  return '📎'
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Note modal ────────────────────────────────────────────────────────────────

function AddNoteModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [title,    setTitle]   = useState('')
  const [content,  setContent] = useState('')
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/intake', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: title || 'Untitled note', content }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error) }
      onAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm px-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[14px] font-bold text-gray-900">Add Note</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-[18px] leading-none">×</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Title (optional)</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Note title…"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] text-gray-700 focus:outline-none focus:border-blue-300 focus:bg-white transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your operational note…"
              rows={5}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] text-gray-700 focus:outline-none focus:border-blue-300 focus:bg-white transition-all resize-none"
            />
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-xl py-2.5 hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !content.trim()} className="flex-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-2.5 transition-colors disabled:opacity-40">
              {loading ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Doc row ───────────────────────────────────────────────────────────────────

function DocRow({ doc }: { doc: VaultDoc }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:border-gray-300 transition-colors">
      <div className="flex items-start gap-3">
        <span className="text-[18px] shrink-0 mt-0.5">{fileIcon(doc.file_type)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-[11.5px] font-semibold text-gray-800 truncate flex-1">{doc.original_name}</p>
            {doc.detected_category && (
              <span className={`text-[8.5px] font-semibold border px-1.5 py-0.5 rounded leading-none shrink-0 ${categoryStyle(doc.detected_category)}`}>
                {doc.detected_category}
              </span>
            )}
          </div>
          {doc.extracted_summary && (
            <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-2">{doc.extracted_summary}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-gray-300">{timeAgo(doc.created_at)}</span>
            {doc.source && doc.source !== 'manual' && (
              <span className="text-[9px] text-gray-300">· via {doc.source}</span>
            )}
            {doc.case_id && (
              <span className="text-[9px] text-blue-400">· linked to case</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const [docs,        setDocs]        = useState<VaultDoc[]>([])
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [showNote,    setShowNote]    = useState(false)
  const [search,      setSearch]      = useState('')
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/intake?limit=50')
      if (res.ok) setDocs(await res.json() as VaultDoc[])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { void fetchDocs() }, [fetchDocs])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/intake/upload', { method: 'POST', body: form })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error) }
      await fetchDocs()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const filtered = docs.filter(d =>
    !search || d.original_name.toLowerCase().includes(search.toLowerCase()) ||
    d.detected_category?.toLowerCase().includes(search.toLowerCase()) ||
    d.extracted_summary?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="3" width="16" height="14" rx="1.5" />
                <circle cx="10" cy="10" r="3" />
                <circle cx="10" cy="10" r="1.2" />
                <path d="M13 10h3M4 10h3" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-[20px] font-bold text-gray-900 leading-none">Vault</h1>
              <p className="text-[11px] text-gray-400 mt-0.5">Central operational evidence hub</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl text-[11px] font-semibold transition-colors disabled:opacity-40 shadow-sm"
          >
            {uploading ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 13v3.5A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V13" strokeLinecap="round" />
                <path d="M10 2.5v9M7 5.5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {uploading ? 'Uploading…' : 'Upload Document'}
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" />

          <button
            onClick={() => setShowNote(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-[11px] font-semibold transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 15V12.5l7-7 2.5 2.5-7 7H4z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 4.5l1.5-1.5 2 2L14 6.5" strokeLinejoin="round" />
            </svg>
            Add Note
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-[11px] font-semibold transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="3" width="16" height="14" rx="1.5" />
              <path d="M6 7h8M6 10.5h5" strokeLinecap="round" />
            </svg>
            Screenshot
          </button>
        </div>

        {uploadError && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-3 py-2.5 text-[11px] mb-4">
            {uploadError}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-5">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13 13l4 4" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vault…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-[11px] text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-300 transition-all"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total', value: docs.length },
            { label: 'Documents', value: docs.filter(d => d.file_type !== 'note').length },
            { label: 'Notes', value: docs.filter(d => d.file_type === 'note').length },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
              <p className="text-[20px] font-bold text-gray-900 leading-none">{s.value}</p>
              <p className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Doc list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
            <p className="text-[32px] mb-3">🗄️</p>
            <p className="text-[13px] font-semibold text-gray-700 mb-1">
              {search ? 'No results' : 'Vault is empty'}
            </p>
            <p className="text-[11px] text-gray-400">
              {search ? 'Try a different search term' : 'Upload a document, screenshot, or add a note to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => <DocRow key={doc.id} doc={doc} />)}
          </div>
        )}
      </div>

      {showNote && (
        <AddNoteModal onClose={() => setShowNote(false)} onAdded={() => { void fetchDocs() }} />
      )}
    </div>
  )
}
