'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ── Icon helpers ──────────────────────────────────────────────────────────────

function GridIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M2 8l8 5.5L18 8" strokeLinecap="round" />
    </svg>
  )
}

function WorkflowIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5" cy="10" r="2.5" />
      <circle cx="15" cy="5.5" r="2.5" />
      <circle cx="15" cy="14.5" r="2.5" />
      <path d="M7.5 10h3.5M12.5 7l-2 2M12.5 13l-2-2" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17 5L8 14l-4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 15V12.5l7-7 2.5 2.5-7 7H4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4.5l1.5-1.5 2 2L14 6.5" strokeLinejoin="round" />
    </svg>
  )
}

function MailFilterIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M6 8.5h8M6 11.5h5" strokeLinecap="round" />
    </svg>
  )
}

function MemoryIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2.5v5M10 12.5v5M2.5 10h5M12.5 10h5" strokeLinecap="round" />
    </svg>
  )
}

// ── Nav data ──────────────────────────────────────────────────────────────────

const NAV_PRIMARY = [
  { href: '/dashboard',    label: 'Dashboard',    Icon: GridIcon },
  { href: '/inbox',        label: 'Inbox',        Icon: InboxIcon },
  { href: '/workflows',    label: 'Workflows',    Icon: WorkflowIcon },
  { href: '/approvals',    label: 'Approvals',    Icon: CheckIcon },
]

const NAV_SECONDARY = [
  { href: '/memory',       label: 'Memory',       Icon: MemoryIcon },
  { href: '/drafts',       label: 'Drafts',       Icon: PencilIcon },
  { href: '/email-triage', label: 'Email Triage', Icon: MailFilterIcon },
]

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href, label, Icon, active,
}: { href: string; label: string; Icon: () => React.ReactElement; active: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
          : 'text-[#525252] hover:text-[#a3a3a3] hover:bg-[#161616]'
      }`}
    >
      <span className={`shrink-0 transition-colors ${active ? 'text-[#f59e0b]' : 'text-[#525252] group-hover:text-[#737373]'}`}>
        <Icon />
      </span>
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto shrink-0 w-1 h-1 rounded-full bg-[#f59e0b]" />}
    </Link>
  )
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ pathname }: { pathname: string }) {
  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border-r border-[#1a1a1a]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[#1a1a1a] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#f59e0b] flex items-center justify-center text-black font-bold text-sm shrink-0">
          Z
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#e5e5e5] leading-none truncate">Command Center</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
            <p className="text-[9px] text-[#3d3d3d]">Operational</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <p className="text-[9px] text-[#333] uppercase tracking-widest px-3 mb-2">Main</p>
        <div className="space-y-0.5">
          {NAV_PRIMARY.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} />
          ))}
        </div>

        <div className="my-3 border-t border-[#161616]" />

        <p className="text-[9px] text-[#333] uppercase tracking-widest px-3 mb-2">Tools</p>
        <div className="space-y-0.5">
          {NAV_SECONDARY.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#161616] shrink-0 flex items-center justify-between">
        <span className="text-[9px] text-[#333]">v1.5</span>
        <span className="text-[9px] text-[#525252] bg-[#111] border border-[#1a1a1a] px-1.5 py-0.5 rounded">Shadow</span>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function ZNavSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop: fixed left */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen w-56 z-20 overflow-hidden">
        <SidebarContent pathname={pathname} />
      </div>

      {/* Mobile: floating nav button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-30 w-10 h-10 rounded-xl bg-[#0d0d0d] border border-[#2a2a2a] text-[#f59e0b] font-bold text-sm flex items-center justify-center shadow-xl"
        aria-label="Open navigation"
      >
        Z
      </button>

      {/* Mobile: overlay panel */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-56 h-full overflow-hidden shrink-0">
            <SidebarContent pathname={pathname} />
          </div>
          <button
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      )}
    </>
  )
}
