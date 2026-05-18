'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { ProjectMemory, MemoryExtraction, SourceType, ExtractionType } from '@/types'

const SOURCE_LABELS: Record<SourceType, string> = {
  upload: 'Upload',
  paste: 'Paste',
  handover: 'Handover',
  transcript: 'Transcript',
  architecture: 'Architecture',
  log: 'Log',
  strategy: 'Strategy',
}

const EXTRACTION_COLORS: Record<ExtractionType, string> = {
  decision:          'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20',
  blocker:           'text-red-400 bg-red-500/10 border-red-500/20',
  next_step:         'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20',
  architecture_rule: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  warning:           'text-orange-400 bg-orange-500/10 border-orange-500/20',
  milestone:         'text-purple-400 bg-purple-500/10 border-purple-500/20',
}

const EXTRACTION_LABEL: Record<ExtractionType, string> = {
  decision:          'DECISION',
  blocker:           'BLOCKER',
  next_step:         'NEXT STEP',
  architecture_rule: 'ARCH RULE',
  warning:           'WARNING',
  milestone:         'MILESTONE',
}

interface MemoryWithExtractions extends ProjectMemory {
  extractions: MemoryExtraction[]
  match_snippet?: string | null
}

interface Props {
  projectId: string
}

type ViewMode = 'list' | 'upload' | 'paste'

export default function MemoryTab({ projectId }: Props) {
  const [memories, setMemories] = useState<MemoryWithExtractions[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Upload form
  const [uploading, setUploading] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadSourceType, setUploadSourceType] = useState<SourceType>('upload')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Paste form
  const [pasteText, setPasteText] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteSourceType, setPasteSourceType] = useState<SourceType>('paste')

  const fetchMemories = useCallback(async (q = '') => {
    if (q) setSearching(true)
    else setLoading(true)
    try {
      const url = `/api/memory/search?project_id=${projectId}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Fetch extractions for each memory
      const withExtractions = await Promise.all(
        (data.memories as ProjectMemory[]).map(async (m) => {
          const exRes = await fetch(`/api/memory/extractions?memory_id=${m.id}`)
          const ex = exRes.ok ? await exRes.json() : { extractions: [] }
          return {
            ...m,
            extractions: ex.extractions ?? [],
            match_snippet: (m as MemoryWithExtractions).match_snippet ?? null,
          } as MemoryWithExtractions
        })
      )
      setMemories(withExtractions)
    } catch {
      setError('Failed to load memories')
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [projectId])

  useEffect(() => { fetchMemories() }, [fetchMemories])

  async function handleFileUpload(file: File) {
    if (!['txt', 'md'].includes(file.name.split('.').pop()?.toLowerCase() ?? '')) {
      setError('Only .txt and .md files are supported')
      return
    }
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', projectId)
      formData.append('source_type', uploadSourceType)
      if (uploadTitle) formData.append('title', uploadTitle)
      const res = await fetch('/api/memory/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setView('list')
      setUploadTitle('')
      await fetchMemories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) { setError('Text cannot be empty'); return }
    if (!pasteTitle.trim()) { setError('Title is required'); return }
    setUploading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('text', pasteText)
      formData.append('title', pasteTitle)
      formData.append('source_type', pasteSourceType)
      formData.append('project_id', projectId)
      const res = await fetch('/api/memory/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setView('list')
      setPasteText('')
      setPasteTitle('')
      await fetchMemories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleReExtract(memoryId: string) {
    try {
      const res = await fetch('/api/memory/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory_id: memoryId }),
      })
      if (res.ok) await fetchMemories(search)
    } catch { /* ignore */ }
  }

  async function handleSearch(q: string) {
    setSearch(q)
    if (!q) { await fetchMemories(); return }
    await fetchMemories(q)
  }

  const sourceOptions: SourceType[] = ['upload', 'paste', 'handover', 'transcript', 'architecture', 'log', 'strategy']

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex gap-1">
          {[0,1,2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => setView('list')}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'list'
                ? 'border-[#f59e0b]/40 text-[#f59e0b] bg-[#f59e0b]/5'
                : 'border-[#2a2a2a] text-[#525252] hover:text-[#a3a3a3]'
            }`}
          >
            Memories ({memories.length})
          </button>
          <button
            onClick={() => { setView('upload'); setError('') }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'upload'
                ? 'border-[#f59e0b]/40 text-[#f59e0b] bg-[#f59e0b]/5'
                : 'border-[#2a2a2a] text-[#525252] hover:text-[#a3a3a3]'
            }`}
          >
            + Upload File
          </button>
          <button
            onClick={() => { setView('paste'); setError('') }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === 'paste'
                ? 'border-[#f59e0b]/40 text-[#f59e0b] bg-[#f59e0b]/5'
                : 'border-[#2a2a2a] text-[#525252] hover:text-[#a3a3a3]'
            }`}
          >
            + Paste Text
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          ⚠️ {error}
          <button onClick={() => setError('')} className="ml-2 text-[#525252] hover:text-[#a3a3a3]">✕</button>
        </div>
      )}

      {/* Upload file view */}
      {view === 'upload' && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Title (optional — auto-filled from filename)</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. SPORTSPULSE Phase 6 Handover"
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Source Type</label>
              <select
                value={uploadSourceType}
                onChange={e => setUploadSourceType(e.target.value as SourceType)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] focus:outline-none focus:border-[#f59e0b]/40"
              >
                {sourceOptions.map(s => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Drag/drop area */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFileUpload(file)
            }}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-[#f59e0b]/60 bg-[#f59e0b]/5'
                : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }}
            />
            <p className="text-sm text-[#525252]">
              {uploading ? 'Ingesting — summarizing & extracting…' : 'Drop .txt or .md here, or click to browse'}
            </p>
            {uploading && (
              <div className="flex justify-center gap-1 mt-3">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paste text view */}
      {view === 'paste' && (
        <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Title *</label>
              <input
                type="text"
                value={pasteTitle}
                onChange={e => setPasteTitle(e.target.value)}
                placeholder="e.g. SPORTSPULSE Phase 6 Handover"
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Source Type</label>
              <select
                value={pasteSourceType}
                onChange={e => setPasteSourceType(e.target.value as SourceType)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] focus:outline-none focus:border-[#f59e0b]/40"
              >
                {sourceOptions.map(s => (
                  <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[#525252] uppercase tracking-wider block mb-1">Text *</label>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={10}
                placeholder="Paste handover document, transcript, architecture notes…"
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 font-mono resize-y"
              />
              <p className="text-[10px] text-[#525252] mt-1">{pasteText.length.toLocaleString()} chars</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePasteSubmit}
              disabled={uploading || !pasteText.trim() || !pasteTitle.trim()}
              className="text-xs border border-[#f59e0b]/30 text-[#f59e0b] px-4 py-2 rounded-lg hover:bg-[#f59e0b]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? 'Ingesting…' : 'Ingest Memory'}
            </button>
            <button
              onClick={() => { setView('list'); setError('') }}
              className="text-xs border border-[#2a2a2a] text-[#525252] px-4 py-2 rounded-lg hover:text-[#a3a3a3] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search memories…"
              className="w-full bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 pr-8"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-0.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1 h-1 rounded-full bg-[#f59e0b]/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
            {search && !searching && (
              <button
                onClick={() => handleSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#a3a3a3] text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {memories.length === 0 && (
            <div className="text-center py-12 text-[#525252]">
              <p className="text-sm mb-3">{search ? `No results for "${search}"` : 'No memories ingested yet'}</p>
              {!search && (
                <button
                  onClick={() => setView('upload')}
                  className="text-xs text-[#f59e0b] border border-[#f59e0b]/30 px-3 py-1.5 rounded-lg hover:bg-[#f59e0b]/10 transition-colors"
                >
                  Upload first memory
                </button>
              )}
            </div>
          )}

          {memories.map(memory => {
            const isExpanded = expandedId === memory.id
            return (
              <div
                key={memory.id}
                className="bg-[#111] border border-[#1e1e1e] rounded-lg hover:border-[#2a2a2a] transition-colors"
              >
                {/* Card header */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : memory.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded shrink-0">
                        {SOURCE_LABELS[memory.source_type]}
                      </span>
                      <span className="text-xs font-medium text-[#e5e5e5] truncate">{memory.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        memory.ingestion_status === 'complete'
                          ? 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20'
                          : memory.ingestion_status === 'failed'
                            ? 'text-red-400 bg-red-500/10 border-red-500/20'
                            : memory.ingestion_status === 'processing'
                              ? 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20'
                              : 'text-[#525252] bg-[#525252]/10 border-[#525252]/20'
                      }`}>
                        {memory.ingestion_status}
                      </span>
                      <span className="text-[10px] text-[#525252]">{new Date(memory.created_at).toLocaleDateString()}</span>
                      <span className="text-[10px] text-[#525252]">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Summary preview */}
                  {memory.summary && (
                    <p className="text-xs text-[#737373] leading-relaxed line-clamp-2">
                      {memory.summary.slice(0, 200)}{memory.summary.length > 200 ? '…' : ''}
                    </p>
                  )}

                  {/* Match snippet */}
                  {memory.match_snippet && (
                    <p className="text-[10px] text-[#525252] mt-1.5 font-mono leading-relaxed">
                      {memory.match_snippet}
                    </p>
                  )}

                  {/* Extraction type badges */}
                  {memory.extractions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(
                        memory.extractions.reduce<Record<string, number>>((acc, e) => {
                          acc[e.extraction_type] = (acc[e.extraction_type] ?? 0) + 1
                          return acc
                        }, {})
                      ).map(([type, count]) => (
                        <span
                          key={type}
                          className={`text-[9px] px-1.5 py-0.5 rounded border ${EXTRACTION_COLORS[type as ExtractionType]}`}
                        >
                          {EXTRACTION_LABEL[type as ExtractionType]} ×{count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded extractions */}
                {isExpanded && (
                  <div className="border-t border-[#1a1a1a] p-4 space-y-2">
                    {memory.summary && (
                      <div className="mb-3">
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-1.5">Summary</p>
                        <p className="text-xs text-[#737373] leading-relaxed whitespace-pre-wrap">{memory.summary}</p>
                      </div>
                    )}

                    {memory.extractions.length > 0 && (
                      <div>
                        <p className="text-[10px] text-[#525252] uppercase tracking-wider mb-2">Extractions</p>
                        <div className="space-y-1.5">
                          {memory.extractions.map(e => (
                            <div key={e.id} className={`flex gap-2 items-start p-2 rounded border ${EXTRACTION_COLORS[e.extraction_type as ExtractionType]} bg-opacity-5`}>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${EXTRACTION_COLORS[e.extraction_type as ExtractionType]}`}>
                                {EXTRACTION_LABEL[e.extraction_type as ExtractionType]}
                              </span>
                              <p className="text-xs text-[#a3a3a3] leading-relaxed flex-1">{e.content}</p>
                              <span className="text-[9px] text-[#525252] shrink-0">{Math.round(e.confidence * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleReExtract(memory.id)}
                        className="text-[10px] text-[#525252] hover:text-[#a3a3a3] border border-[#2a2a2a] px-2 py-1 rounded transition-colors"
                      >
                        Re-extract
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
