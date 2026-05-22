'use client'

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IntakeDoc {
  id:                 string
  original_name:      string
  file_type:          string
  source:             string
  status:             string
  detected_category:  string | null
  suggested_workflow: string | null
  extracted_summary:  string | null
  case_id:            string | null
  file_size:          number | null
  created_at:         string
}

interface UploadState {
  file:     File
  status:   'pending' | 'uploading' | 'done' | 'error'
  error?:   string
  result?:  IntakeDoc
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const FILE_TYPE_COLOR: Record<string, string> = {
  pdf:   'text-red-500',
  docx:  'text-blue-600',
  txt:   'text-gray-400',
  csv:   'text-green-600',
  image: 'text-violet-600',
  note:  'text-amber-600',
  other: 'text-gray-400',
}

const CATEGORY_BADGE: Record<string, string> = {
  claim:          'bg-red-50 text-red-600 border-red-200',
  contract:       'bg-blue-50 text-blue-600 border-blue-200',
  compliance:     'bg-violet-50 text-violet-600 border-violet-200',
  invoice:        'bg-amber-50 text-amber-700 border-amber-200',
  report:         'bg-green-50 text-green-700 border-green-200',
  correspondence: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  incident:       'bg-orange-50 text-orange-700 border-orange-200',
  general:        'bg-gray-100 text-gray-500 border-gray-200',
}

const ACCEPTED_TYPES = '.pdf,.docx,.doc,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp'

// ── Recent intake row ─────────────────────────────────────────────────────────

function IntakeRow({ doc, last }: { doc: IntakeDoc; last: boolean }) {
  const ftColor  = FILE_TYPE_COLOR[doc.file_type] ?? 'text-gray-400'
  const catStyle = CATEGORY_BADGE[doc.detected_category ?? 'general'] ?? CATEGORY_BADGE.general

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${!last ? 'border-b border-gray-100' : ''} hover:bg-gray-50 transition-colors`}>
      <span className={`text-[8px] font-mono font-bold shrink-0 uppercase w-8 ${ftColor}`}>{doc.file_type}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] text-gray-700 truncate">{doc.original_name}</p>
        {doc.extracted_summary && (
          <p className="text-[7.5px] text-gray-400 truncate mt-0.5">{doc.extracted_summary}</p>
        )}
      </div>
      {doc.detected_category && (
        <span className={`shrink-0 text-[7.5px] px-1.5 py-0.5 rounded-full border ${catStyle}`}>{doc.detected_category}</span>
      )}
      {doc.case_id && (
        <Link href={`/cases/${doc.case_id}`} className="shrink-0 text-[7.5px] text-gray-400 hover:text-blue-600 transition-colors border border-gray-200 px-1.5 py-0.5 rounded">Case →</Link>
      )}
      <span className="shrink-0 text-[7.5px] text-gray-300 tabular-nums font-mono w-16 text-right">
        {new Date(doc.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntakePage() {
  const [uploads,      setUploads]      = useState<UploadState[]>([])
  const [recentDocs,   setRecentDocs]   = useState<IntakeDoc[]>([])
  const [loadingDocs,  setLoadingDocs]  = useState(true)
  const [dragging,     setDragging]     = useState(false)
  const [noteContent,  setNoteContent]  = useState('')
  const [noteTitle,    setNoteTitle]    = useState('')
  const [noteCategory, setNoteCategory] = useState('')
  const [noteLoading,  setNoteLoading]  = useState(false)
  const [noteSuccess,  setNoteSuccess]  = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/intake?limit=20')
      if (res.ok) setRecentDocs(await res.json() as IntakeDoc[])
    } catch { /* non-fatal */ } finally { setLoadingDocs(false) }
  }, [])

  useEffect(() => { void loadDocs() }, [loadDocs])

  // Upload a single file
  const uploadFile = useCallback(async (file: File, index: number) => {
    setUploads(prev => prev.map((u, i) => i === index ? { ...u, status: 'uploading' } : u))

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await fetch('/api/intake/upload', { method: 'POST', body: fd })
      const json = await res.json() as IntakeDoc & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setUploads(prev => prev.map((u, i) => i === index ? { ...u, status: 'done', result: json } : u))
      void loadDocs()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploads(prev => prev.map((u, i) => i === index ? { ...u, status: 'error', error: msg } : u))
    }
  }, [loadDocs])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const next: UploadState[] = arr.map(f => ({ file: f, status: 'pending' }))
    setUploads(prev => {
      const startIdx = prev.length
      const merged   = [...prev, ...next]
      // Auto-start uploads
      arr.forEach((_, i) => { void uploadFile(arr[i], startIdx + i) })
      return merged
    })
  }, [uploadFile])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const submitNote = async () => {
    if (!noteContent.trim()) return
    setNoteLoading(true)
    try {
      const res = await fetch('/api/intake', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: noteTitle || undefined, content: noteContent, category: noteCategory || undefined }),
      })
      if (!res.ok) throw new Error('Failed to save note')
      setNoteContent('')
      setNoteTitle('')
      setNoteCategory('')
      setNoteSuccess(true)
      setTimeout(() => setNoteSuccess(false), 2000)
      void loadDocs()
    } catch { /* non-fatal */ } finally { setNoteLoading(false) }
  }

  const pendingCount = uploads.filter(u => u.status === 'uploading' || u.status === 'pending').length
  const doneCount    = uploads.filter(u => u.status === 'done').length

  return (
    <div className="min-h-screen bg-[#F7F8FA]">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur-md px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-20 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10B981]" />
          </span>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.1em]">Operational Intake</p>
        </div>
        <div className="w-px h-4 bg-gray-200" />
        {pendingCount > 0 && <span className="text-[9px] text-amber-600">{pendingCount} uploading…</span>}
        {doneCount > 0 && pendingCount === 0 && <span className="text-[9px] text-green-600">{doneCount} uploaded</span>}
        <Link href="/cases" className="ml-auto text-[8.5px] text-gray-400 hover:text-gray-600 transition-colors border border-gray-200 px-2.5 py-1.5 rounded-lg">View Cases →</Link>
      </header>

      <main className="px-6 py-5 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">

          {/* ── Left: intake forms ──────────────────────────────────── */}
          <div className="space-y-4">

            {/* Drop zone */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">File Upload</h2>
                <p className="text-[9px] text-gray-400">PDF · DOCX · TXT · CSV · Images</p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-8 h-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div>
                    <p className="text-[11px] text-gray-500">{dragging ? 'Drop files here' : 'Drag & drop files or click to browse'}</p>
                    <p className="text-[9px] text-gray-400 mt-1">Auto-classifies type, category and suggests workflow</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES}
                  className="hidden"
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
                />
              </div>
            </section>

            {/* Upload progress */}
            {uploads.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Upload Queue</span>
                  {uploads.every(u => u.status === 'done' || u.status === 'error') && (
                    <button onClick={() => setUploads([])} className="text-[8px] text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                  )}
                </div>
                {uploads.map((u, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i < uploads.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${u.status === 'done' ? 'bg-[#10B981]' : u.status === 'error' ? 'bg-red-500' : u.status === 'uploading' ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'}`} />
                    <span className="flex-1 text-[9px] text-gray-600 truncate">{u.file.name}</span>
                    <span className="text-[7.5px] text-gray-400 shrink-0">{formatBytes(u.file.size)}</span>
                    {u.status === 'done' && u.result && (
                      <span className={`text-[7.5px] px-1.5 py-0.5 rounded-full border shrink-0 ${CATEGORY_BADGE[u.result.detected_category ?? 'general'] ?? CATEGORY_BADGE.general}`}>
                        {u.result.detected_category}
                      </span>
                    )}
                    {u.status === 'error' && <span className="text-[7.5px] text-red-600 shrink-0 max-w-[120px] truncate">{u.error}</span>}
                    {u.status === 'uploading' && <span className="text-[7.5px] text-amber-600 shrink-0">uploading…</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Manual note */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Manual Note</h2>
                <p className="text-[9px] text-gray-400">Inline operational note or context</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Note title (optional)"
                    value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[10px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-blue-300 focus:bg-white transition-colors"
                  />
                  <textarea
                    rows={4}
                    placeholder="Enter operational note, context, or action item…"
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[10px] text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-blue-300 focus:bg-white transition-colors resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={noteCategory}
                      onChange={e => setNoteCategory(e.target.value)}
                      className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[9px] text-gray-500 focus:outline-none focus:border-blue-300 transition-colors"
                    >
                      <option value="">Auto-detect category</option>
                      <option value="claim">Claim</option>
                      <option value="contract">Contract</option>
                      <option value="compliance">Compliance</option>
                      <option value="invoice">Invoice</option>
                      <option value="incident">Incident</option>
                      <option value="general">General</option>
                    </select>
                    <button
                      onClick={() => void submitNote()}
                      disabled={noteLoading || !noteContent.trim()}
                      className="ml-auto flex items-center gap-1.5 text-[9px] bg-blue-600 border border-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {noteLoading ? 'Saving…' : noteSuccess ? '✓ Saved' : 'Save Note'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ── Right: recent intakes ────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.09em]">Recent Intake</h2>
              <span className="text-[8px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">{recentDocs.length}</span>
            </div>

            {loadingDocs ? (
              <div className="space-y-px animate-pulse">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-11 bg-gray-100 rounded-xl border border-gray-200 mb-0.5" />)}
              </div>
            ) : recentDocs.length === 0 ? (
              <div className="text-center py-14 bg-white border border-gray-200 rounded-2xl">
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 2.5h7l3.5 3.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V3.5A1 1 0 015 2.5z"/>
                  <path d="M12 2.5v4h3.5M7 10h6M7 13h4" strokeLinecap="round"/>
                </svg>
                <p className="text-[10px] text-gray-400">No intake documents yet</p>
                <p className="text-[9px] text-gray-300 mt-1">Upload a file or add a note to get started</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {recentDocs.map((doc, i) => (
                  <IntakeRow key={doc.id} doc={doc} last={i === recentDocs.length - 1} />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  )
}
