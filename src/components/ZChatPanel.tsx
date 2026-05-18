'use client'

import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '@/types'

interface Props {
  projectId: string
  projectName: string
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <div
      className="z-prose text-xs leading-relaxed"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  )
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/⚠️/g, '<span style="color:#f59e0b">⚠️</span>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, (line) => line ? line : '')
    .split('\n').join('<br/>')
}

const QUICK_PROMPTS = [
  'What next?',
  'What is blocked?',
  'Summarize current status',
  'Generate a Claude Code prompt for the next task',
]

export default function ZChatPanel({ projectId, projectName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    const userMsg: ChatMessage = { role: 'user', content: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, messages: newMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get response')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#f59e0b] flex items-center justify-center text-black text-xs font-bold">
            Z
          </div>
          <span className="text-xs font-medium text-[#e5e5e5]">Z · {projectName}</span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-[10px] text-[#525252] hover:text-[#737373] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-[#525252] mb-4">Ask Z anything about this project</p>
            <div className="space-y-2">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="block w-full text-left text-xs text-[#737373] bg-[#111] border border-[#1e1e1e] px-3 py-2 rounded-lg hover:border-[#f59e0b]/30 hover:text-[#a3a3a3] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-4 h-4 rounded bg-[#f59e0b] flex items-center justify-center text-black text-[9px] font-bold shrink-0 mt-0.5 mr-2">
                Z
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-[#1a1a1a] text-[#e5e5e5] text-xs'
                  : 'bg-transparent text-[#a3a3a3]'
              }`}
            >
              {msg.role === 'assistant' ? (
                <MarkdownContent text={msg.content} />
              ) : (
                <p className="text-xs">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#f59e0b]/60 flex items-center justify-center text-black text-[9px] font-bold">
              Z
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#1a1a1a]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask Z..."
            className="flex-1 bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-xs text-[#e5e5e5] placeholder-[#525252] focus:outline-none focus:border-[#f59e0b]/40 transition-colors"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="bg-[#f59e0b] text-black text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#d97706] transition-colors disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
