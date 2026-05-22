'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

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

function ChecklistIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="2" width="14" height="16" rx="1.5" />
      <path d="M7 7l2 2 4-4M7 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function VaultIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="1.2" />
      <path d="M13 10h3M4 10h3" strokeLinecap="round" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="7" width="16" height="10" rx="1.5" />
      <path d="M7 7V5.5A1.5 1.5 0 018.5 4h3A1.5 1.5 0 0113 5.5V7" strokeLinecap="round" />
      <path d="M2 11.5h16" strokeLinecap="round" />
    </svg>
  )
}

function InsightsIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 14l4-5 3 3 3-4 4 3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TimelineIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3 2" strokeLinecap="round" strokeLinejoin="round" />
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

function PlugIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 2v4M13 2v4M5 6h10v4a5 5 0 01-10 0V6z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14v4" strokeLinecap="round" />
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

function ThinkTankIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5a5 5 0 014 8l-.5 1H6.5L6 10.5a5 5 0 014-8z" strokeLinejoin="round" />
      <path d="M7.5 13.5h5M8 16h4" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13 13l4 4" strokeLinecap="round" />
    </svg>
  )
}

function ShieldCheckIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5L3.5 5v5c0 4 3 6.5 6.5 7.5 3.5-1 6.5-3.5 6.5-7.5V5L10 2.5z" strokeLinejoin="round" />
      <path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AuditIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="2" width="14" height="16" rx="1.5" />
      <path d="M6.5 6.5h7M6.5 10h7M6.5 13.5h4" strokeLinecap="round" />
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

function SystemProofIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 2.5L3.5 5v5c0 4 3 6.5 6.5 7.5 3.5-1 6.5-3.5 6.5-7.5V5L10 2.5z" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  )
}

function HeartbeatIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 10h3.5l2-4 2.5 8 2-4H18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WorkspaceIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <path d="M6 4V3M10 4V3M14 4V3" strokeLinecap="round" />
      <path d="M5 9h10M5 12.5h6" strokeLinecap="round" />
    </svg>
  )
}

function MembersIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7.5" cy="7" r="3" />
      <path d="M1.5 17c0-3.3 2.7-6 6-6" strokeLinecap="round" />
      <circle cx="14" cy="7" r="2.5" />
      <path d="M17.5 17c0-2.5-1.6-4.5-3.5-5.5" strokeLinecap="round" />
    </svg>
  )
}

function IntegrationsIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="8" width="5" height="5" rx="1" />
      <rect x="13" y="8" width="5" height="5" rx="1" />
      <rect x="7.5" y="3" width="5" height="5" rx="1" />
      <path d="M4.5 8V6.5a3 3 0 013-3h1M12 5.5h1a3 3 0 013 3V8" strokeLinecap="round" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-[15px] h-[15px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 3H4a1 1 0 00-1 1v12a1 1 0 001 1h3" strokeLinecap="round" />
      <path d="M13 14l3-4-3-4M16 10H7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Nav sections ──────────────────────────────────────────────────────────────

const NAV_MAIN = [
  { href: '/dashboard',       label: 'Dashboard',       Icon: GridIcon },
  { href: '/launch-checklist',label: 'Launch Checklist',Icon: ChecklistIcon },
  { href: '/vault',           label: 'Vault',           Icon: VaultIcon },
  { href: '/cases',           label: 'Cases',           Icon: BriefcaseIcon },
  { href: '/insights',        label: 'Intelligence',    Icon: InsightsIcon },
  { href: '/timeline',        label: 'Timeline',        Icon: TimelineIcon },
]

const NAV_TOOLS = [
  { href: '/workflows',    label: 'Workflows',    Icon: WorkflowIcon },
  { href: '/connections',  label: 'Connections',  Icon: PlugIcon },
  { href: '/memory',       label: 'Memory',       Icon: MemoryIcon },
  { href: '/think-tank',   label: 'Think Tank',   Icon: ThinkTankIcon },
  { href: '/search',       label: 'Search',       Icon: SearchIcon },
]

const NAV_TRUST = [
  { href: '/security',  label: 'Security',    Icon: ShieldCheckIcon },
  { href: '/audit',     label: 'Audit Trail', Icon: AuditIcon },
]

const NAV_EXECUTION = [
  { href: '/browser-execution', label: 'Browser Execution', Icon: BrowserIcon,      badge: 'Sandbox' },
  { href: '/system-proof',      label: 'System Proof',      Icon: SystemProofIcon,  badge: 'Live'    },
  { href: '/runtime-health',    label: 'Runtime Health',    Icon: HeartbeatIcon },
]

const NAV_SETTINGS = [
  { href: '/settings/workspace',    label: 'Workspace',    Icon: WorkspaceIcon },
  { href: '/settings/members',      label: 'Members',      Icon: MembersIcon },
  { href: '/settings/integrations', label: 'Integrations', Icon: IntegrationsIcon },
]

// ── Section label / divider ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-[0.12em] px-3 mb-1.5 mt-0.5">
      {children}
    </p>
  )
}

function Divider() {
  return <div className="my-2.5 mx-2 border-t border-gray-200" />
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
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-blue-600 rounded-r-full" />
      )}
      <span className={`shrink-0 transition-colors ${active ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500'}`}>
        <Icon />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className={`shrink-0 text-[8px] font-semibold px-1.5 py-0.5 rounded leading-none tracking-wide ${
          active
            ? 'text-blue-600 bg-blue-50 border border-blue-200'
            : 'text-gray-400 bg-gray-100 border border-gray-200'
        }`}>
          {badge}
        </span>
      )}
    </Link>
  )
}

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({ pathname, profile, onLogout }: {
  pathname: string
  profile: { full_name?: string; email?: string } | null
  onLogout: () => void
}) {
  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'Z'

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center text-white font-bold text-[13px] shrink-0 shadow-[0_2px_8px_rgba(37,99,235,0.25)]">
          Z
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-semibold text-gray-800 leading-none truncate">Command Center</p>
            {process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true' && (
              <span className="shrink-0 text-[7.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 leading-none tracking-wide uppercase">
                Dev
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-[3px]">
            <span className="w-1 h-1 rounded-full bg-[#10B981] animate-pulse shrink-0" />
            <p className="text-[9px] text-gray-400">Operational</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto scrollbar-thin">
        <SectionLabel>Main</SectionLabel>
        <div className="space-y-0.5">
          {NAV_MAIN.map(item => (
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

        <SectionLabel>Trust</SectionLabel>
        <div className="space-y-0.5">
          {NAV_TRUST.map(item => (
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

        <SectionLabel>Settings</SectionLabel>
        <div className="space-y-0.5">
          {NAV_SETTINGS.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} Icon={item.Icon} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Footer — user */}
      <div className="px-3 py-3 border-t border-gray-200 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-[10px] font-semibold text-blue-600 shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-gray-700 truncate leading-none">
              {profile?.full_name ?? 'Operator'}
            </p>
            <p className="text-[8.5px] text-gray-400 truncate mt-0.5">
              {profile?.email ?? ''}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1"
            title="Sign out"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function ZNavSidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profile, setProfile]       = useState<{ full_name?: string; email?: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((d: { full_name?: string; email?: string } | null) => { if (d) setProfile(d) })
      .catch(() => null)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/auth/login')
  }

  return (
    <>
      {/* Desktop: fixed left */}
      <div className="hidden lg:block fixed left-0 top-0 h-screen w-56 z-20 overflow-hidden">
        <SidebarContent pathname={pathname} profile={profile} onLogout={handleLogout} />
      </div>

      {/* Mobile: floating nav button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-30 w-10 h-10 rounded-xl bg-white border border-gray-200 text-blue-600 font-bold text-sm flex items-center justify-center shadow-lg"
        aria-label="Open navigation"
      >
        Z
      </button>

      {/* Mobile: overlay panel */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-56 h-full overflow-hidden shrink-0">
            <SidebarContent pathname={pathname} profile={profile} onLogout={handleLogout} />
          </div>
          <button
            className="flex-1 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      )}
    </>
  )
}
