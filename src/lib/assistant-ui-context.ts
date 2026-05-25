import type { WorkspaceMode } from './workspace-state'

export interface AssistantQuickAction {
  label:   string
  mode?:   WorkspaceMode
  href?:   string
  prompt?: string
  color:   string
}

export interface AssistantUIContext {
  title:        string
  guidance:     string
  quickActions: AssistantQuickAction[]
}

export const ASSISTANT_UI_CONTEXTS: Record<WorkspaceMode, AssistantUIContext> = {
  dashboard_home: {
    title:    'Operational Overview',
    guidance: 'Start by choosing an operational action or ask Z for guidance.',
    quickActions: [
      { label: 'Add to Vault',             mode: 'vault_upload',         color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'          },
      { label: 'Run Workflow',             mode: 'workflow_run',         color: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100'  },
      { label: 'View Procedural Patterns', mode: 'procedural_patterns',  color: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100'          },
      { label: 'View Workflow Learning',   mode: 'workflow_learning',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
    ],
  },
  vault_upload: {
    title:    'Vault Intake',
    guidance: 'Upload evidence, notes, screenshots, or documents into operational memory.',
    quickActions: [
      { label: 'Upload Document',      mode: 'vault_upload', color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'  },
      { label: 'View Recent Uploads',  href: '/vault',       color: 'text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100'  },
    ],
  },
  workflow_run: {
    title:    'Workflow Execution',
    guidance: 'Select or run a workflow. Z will preserve events for replay and learning.',
    quickActions: [
      { label: 'Run Workflow',         mode: 'workflow_run', color: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100' },
      { label: 'View Workflow Events', mode: 'events_view',  color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'    },
    ],
  },
  events_view: {
    title:    'Operational Events',
    guidance: 'Review what Z has recorded across uploads, workflows, and assistant retrieval.',
    quickActions: [
      { label: 'View Operational Replay', mode: 'operational_replay', color: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100' },
      { label: 'Refresh Events',          mode: 'events_view',        color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'     },
      { label: 'Open Events Page',        href: '/events',            color: 'text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100'          },
    ],
  },
  case_focus: {
    title:    'Case Focus',
    guidance: 'This workspace is focused on one operational case.',
    quickActions: [
      { label: 'Add Note',      prompt: 'Add a note to the current case', color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'    },
      { label: 'Link Workflow', mode: 'workflow_run',                      color: 'text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100' },
      { label: 'View Timeline', href: '/cases',                            color: 'text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100'    },
    ],
  },
  memory_debug: {
    title:    'Memory Debug',
    guidance: 'Inspect what memory Z retrieved, blocked, or prioritized.',
    quickActions: [
      { label: 'View Retrieval Telemetry', mode: 'memory_debug',                                                color: 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100' },
      { label: 'View Procedural Patterns', mode: 'procedural_patterns',                                         color: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100'         },
      { label: 'Test Retrieval',           prompt: 'What memory do you have about recent operational events?',   color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'         },
    ],
  },
  runtime_health: {
    title:    'Runtime Health',
    guidance: 'Check integrations, runtime status, and system proof signals.',
    quickActions: [
      { label: 'Check Health',     href: '/runtime-health', color: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' },
      { label: 'View System Proof', href: '/system-proof',  color: 'text-gray-700 bg-gray-50 border-gray-200 hover:bg-gray-100'    },
    ],
  },
  operational_replay: {
    title:    'Operational Replay',
    guidance: 'See a chronological record of what happened across this workspace.',
    quickActions: [
      { label: 'View Operational Replay',  mode: 'operational_replay',                           color: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'   },
      { label: 'View Procedural Patterns', mode: 'procedural_patterns',                          color: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100'           },
      { label: 'View Workflow Learning',   mode: 'workflow_learning',                            color: 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
    ],
  },
  procedural_patterns: {
    title:    'Procedural Patterns',
    guidance: 'Repeated event sequences Z has detected and learned from.',
    quickActions: [
      { label: 'Detect Patterns',        prompt: 'How do we usually handle this type of operational event?', color: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100'           },
      { label: 'View Workflow Learning',  mode: 'workflow_learning',                                          color: 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100' },
      { label: 'View Replay',            mode: 'operational_replay',                                          color: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'   },
    ],
  },
  workflow_learning: {
    title:    'Workflow Learning',
    guidance: 'Track how Z is learning from your operational patterns and workflow history.',
    quickActions: [
      { label: 'View Procedural Patterns', mode: 'procedural_patterns',                                  color: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100'           },
      { label: 'Ask About Patterns',       prompt: 'How do we usually handle operational events here?',  color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'           },
      { label: 'View Replay',              mode: 'operational_replay',                                   color: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'   },
    ],
  },
}
