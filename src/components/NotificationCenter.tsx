'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { Notification } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const SEV_CFG = {
  critical: { dot: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-500/10 text-red-400 border-red-500/20',    banner: 'bg-red-500/10 border-red-500/25 text-red-300' },
  warning:  { dot: 'bg-[#f59e0b]',  text: 'text-[#f59e0b]',  badge: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20', banner: '' },
  info:     { dot: 'bg-[#525252]',  text: 'text-[#a3a3a3]',  badge: 'bg-[#1a1a1a] text-[#525252] border-[#222]',      banner: '' },
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Bell icon SVG ─────────────────────────────────────────────────────────────

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2.5a5.5 5.5 0 0 1 5.5 5.5v2.5l1.5 2H3L4.5 10.5V8A5.5 5.5 0 0 1 10 2.5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 15.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  )
}

// ── Notification row ──────────────────────────────────────────────────────────

function NotifRow({
  n,
  onRead,
  onDismiss,
}: {
  n: Notification
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const cfg = SEV_CFG[n.severity]

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-[#1a1a1a] last:border-0 ${n.read ? 'opacity-60' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${cfg.dot} ${!n.read ? '' : 'opacity-50'}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-medium leading-snug ${n.read ? 'text-[#737373]' : 'text-[#e5e5e5]'}`}>
            {n.title}
          </p>
          <button
            onClick={() => onDismiss(n.id)}
            className="text-[#3a3a3a] hover:text-[#737373] transition-colors shrink-0 text-sm leading-none mt-0.5"
            title="Dismiss"
          >
            ×
          </button>
        </div>
        <p className="text-[10px] text-[#909090] mt-0.5 leading-snug line-clamp-2">{n.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${cfg.badge}`}>
            {n.severity}
          </span>
          <span className="text-[9px] text-[#6a6a6a] tabular-nums">{relativeTime(n.created_at)}</span>
          {n.action_url && (
            <Link
              href={n.action_url}
              onClick={() => onRead(n.id)}
              className="text-[9px] text-[#f59e0b] hover:text-[#d97706] transition-colors ml-auto shrink-0"
            >
              View →
            </Link>
          )}
          {!n.read && !n.action_url && (
            <button
              onClick={() => onRead(n.id)}
              className="text-[9px] text-[#3a3a3a] hover:text-[#525252] transition-colors ml-auto"
            >
              Mark read
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen]                   = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications?limit=50')
    if (res.ok) setNotifications(await res.json())
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 30_000)
    return () => clearInterval(t)
  }, [load])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function dismiss(id: string) {
    await fetch(`/api/notifications/${id}/dismiss`, { method: 'POST' })
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read)
    await Promise.all(unread.map(n => fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })))
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unread    = notifications.filter(n => !n.read)
  const criticals = notifications.filter(n => n.severity === 'critical' && !n.read)

  // Group non-dismissed by severity
  const ordered = [
    ...notifications.filter(n => n.severity === 'critical'),
    ...notifications.filter(n => n.severity === 'warning'),
    ...notifications.filter(n => n.severity === 'info'),
  ]

  return (
    <>
      {/* ── Bell button + dropdown ──────────────────────────────────────────── */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(v => !v)}
          className={`relative flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
            open
              ? 'bg-[#1e1e1e] border-[#2a2a2a] text-[#e5e5e5]'
              : 'border-[#1a1a1a] text-[#525252] hover:text-[#a3a3a3] hover:border-[#222]'
          }`}
          title="Notifications"
        >
          <BellIcon />
          {unread.length > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-black ${
              criticals.length > 0 ? 'bg-red-500' : 'bg-[#f59e0b]'
            }`}>
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-[#0d0d0d] border border-[#1e1e1e] rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a1a1a]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#e5e5e5]">Notifications</span>
                {unread.length > 0 && (
                  <span className="text-[9px] bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 px-1.5 py-0.5 rounded-full">
                    {unread.length} unread
                  </span>
                )}
              </div>
              {unread.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-[#3a3a3a] hover:text-[#a3a3a3] transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto">
              {ordered.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-xs text-[#525252]">No notifications</p>
                  <p className="text-[10px] text-[#3a3a3a] mt-0.5">All systems clear</p>
                </div>
              ) : (
                ordered.map(n => (
                  <NotifRow key={n.id} n={n} onRead={markRead} onDismiss={dismiss} />
                ))
              )}
            </div>

            {ordered.length > 0 && (
              <div className="px-3 py-2 border-t border-[#1a1a1a]">
                <p className="text-[9px] text-[#3a3a3a] text-center">
                  {notifications.length} active notification{notifications.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Critical banner ─────────────────────────────────────────────────── */}
      {criticals.length > 0 && !bannerDismissed && (
        <div className="fixed top-14 left-0 right-0 z-[15] pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-2xl mt-2 px-4">
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              <p className="flex-1 text-xs text-red-300 font-medium">
                {criticals.length > 1
                  ? `${criticals.length} critical issues require attention`
                  : criticals[0].title}
              </p>
              <button
                onClick={() => setOpen(true)}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors shrink-0 border border-red-500/30 px-2 py-0.5 rounded"
              >
                Review
              </button>
              <button
                onClick={() => setBannerDismissed(true)}
                className="text-red-500/60 hover:text-red-400 transition-colors text-sm leading-none shrink-0"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
