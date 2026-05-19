'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ── Icons ─────────────────────────────────────────────────────────────────────

function GridIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M2 8l8 5.5L18 8" strokeLinecap="round" />
    </svg>
  )
}

function WorkflowIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="5" cy="10" r="2.5" />
      <circle cx="15" cy="5.5" r="2.5" />
      <circle cx="15" cy="14.5" r="2.5" />
      <path d="M7.5 10h3.5M12.5 7l-2 2M12.5 13l-2-2" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M17 5L8 14l-4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 15V12.5l7-7 2.5 2.5-7 7H4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4.5l1.5-1.5 2 2L14 6.5" strokeLinejoin="round" />
    </svg>
  )
}

function MailFilterIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M6 8.5h8M6 11.5h5" strokeLinecap="round" />
    </svg>
  )
}

function MemoryIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2.5v5M10 12.5v5M2.5 10h5M12.5 10h5" strokeLinecap="round" />
    </svg>
  )
}

function CanaryIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3c-1.5 0-3 1-3.5 2.5L5 8h10l-1.5-2.5C13 4 11.5 3 10 3z" strokeLinejoin="round" />
      <rect x="4" y="8" width="12" height="2.5" rx="1" />
      <path d="M7 10.5v4M10 10.5v4M13 10.5v4" strokeLinecap="round" />
      <path d="M5 14.5h10" strokeLinecap="round" />
    </svg>
  )
}

function BrowserIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="16" height="14" rx="2" />
      <path d="M2 7h16" strokeLinecap="round" />
      <circle cx="5.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
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

const NAV_TOOLS = [
  { href: '/memory',       label: 'Memory',       Icon: MemoryIcon },
  { href: '/drafts',       label: 'Drafts',       Icon: PencilIcon },
  { href: '/email-triage', label: 'Email Triage', Icon: MailFilterIcon },
]

const NAV_EXECUTION = [
  { href: '/browser-execution', label: 'Browser', Icon: BrowserIcon, badge: 'Sandbox' },
]

const NAV_SPORTS = [
  { href: '/canary', label: 'Canary', Icon: CanaryIcon },
]

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold text-[#2e2e2e] uppercase tracking-[0.12em] px-3 mb-1.5 mt-0.5">
      {children}
    </p>
  )
}

function Divider() {
  return <div className="my-2.5 mx-2 border-t border-[#161616]" />
}

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href, label, Icon, active, badge,
}: {
  href: string
  label: string
  Icon: () => React.ReactElement
  active: boolean
  badge?: string
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[11px] font-medium transition-all ${
        active
          ? 'bg-[#f59e0b]/[0.08] text-[#f5a623]'
          : 'text-[#4a4a4a] hover:text-[#888] hover:bg-[#141414]'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-[#f59e0b] rounded-r-full" />
      )}
      <span className={`shrink-0 transition-colors ${active ? 'text-[#f59e0b]' : 'text-[#404040] group-hover:text-[#666]'}`}>
        <Icon />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && !active && (
        <span className="shrink-0 text-[8px] font-semibold text-[#525252] bg-[#1a1a1a] border border-[#252525] px-1.5 py-0.5 rounded leading-none tracking-wide">
          {badge}
        </span>
      )}
      {badge && active && (
        <span className="shrink-0 text-[8px] font-semibold text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-1.5 py-0.5 rounded leading-none tracking-wide">
          {badge}
        </span>
      )}
    </Link>
  )
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ pathname, workspaceName }: { pathname: string; workspaceName: string | null }) {
  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0b0b0b', borderRight: '1px solid #161616' }}>
      {/* Logo / brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-[#161616] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#f59e0b] flex items-center justify-center text-black font-bold text-[13px] shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
          Z
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#d4d4d4] leading-none truncate">Command Center</p>
          <div className="flex items-center gap-1.5 mt-[3px]">
            <span className="w-1 h-1 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
            <p className="text-[9px] text-[#333]">Operational</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin">
        <SectionLabel>Main</SectionLabel>
        <div className="space-y-0.5">
          {NAV_PRIMARY.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} />
          ))}
        </div>

        <Divider />

        <SectionLabel>Tools</SectionLabel>
        <div className="space-y-0.5">
          {NAV_TOOLS.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} />
          ))}
        </div>

        <Divider />

        <SectionLabel>Execution</SectionLabel>
        <div className="space-y-0.5">
          {NAV_EXECUTION.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} badge={item.badge} />
          ))}
        </div>

        <Divider />

        <SectionLabel>Sports</SectionLabel>
        <div className="space-y-0.5">
          {NAV_SPORTS.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-[#161616] shrink-0">
        {workspaceName && (
          <p className="text-[9px] text-[#333] truncate mb-2 px-1" title={workspaceName}>
            {workspaceName}
          </p>
        )}
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] text-[#2a2a2a] font-mono">v1.6</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#22c55e]" />
            <span className="text-[9px] text-[#333]">Shadow Mode</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function ZNavSidebar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen]     = useState(false)
  const [workspaceName, setWorkspaceName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/workspace/current')
      .then(r => r.ok ? r.json() : null)
      .then((d: { workspace?: { name: string } } | null) => {
        if (d?.workspace?.name) setWorkspaceName(d.workspace.name)
      })
      .catch(() => null)
  }, [])

  return (
    <>
      {/* Desktop: fixed left */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen w-56 z-20 overflow-hidden">
        <SidebarContent pathname={pathname} workspaceName={workspaceName} />
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
            <SidebarContent pathname={pathname} workspaceName={workspaceName} />
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
