// Workspace mode definitions — pure types, no React

export type WorkspaceMode =
  | 'dashboard_home'
  | 'vault_upload'
  | 'workflow_run'
  | 'case_focus'
  | 'events_view'
  | 'memory_debug'
  | 'runtime_health'
  | 'operational_replay'
  | 'procedural_patterns'
  | 'workflow_learning'

const VALID_MODES = new Set<string>([
  'dashboard_home', 'vault_upload', 'workflow_run',
  'case_focus', 'events_view', 'memory_debug', 'runtime_health',
  'operational_replay', 'procedural_patterns', 'workflow_learning',
])

export function isWorkspaceMode(s: string | null): s is WorkspaceMode {
  return s !== null && VALID_MODES.has(s)
}

export interface WorkspaceAction {
  mode:    WorkspaceMode
  label:   string
  desc:    string
  color:   string
}

// The 3 primary quick actions shown on dashboard home
export const PRIMARY_ACTIONS: WorkspaceAction[] = [
  {
    mode:  'vault_upload',
    label: 'Add to Vault',
    desc:  'Upload a file or add a note',
    color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100',
  },
  {
    mode:  'workflow_run',
    label: 'Run Workflow',
    desc:  'Start an operational workflow',
    color: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100',
  },
  {
    mode:  'events_view',
    label: 'View Events',
    desc:  'Recent operational events',
    color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100',
  },
]

// Build the dashboard URL for a given workspace mode
export function workspaceModeUrl(
  mode: WorkspaceMode,
  extra?: Record<string, string>,
): string {
  if (mode === 'dashboard_home') return '/dashboard'
  const p = new URLSearchParams({ ws: mode, ...extra })
  return `/dashboard?${p.toString()}`
}
