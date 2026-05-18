/**
 * inbox-workflow-detector.ts — deterministic keyword-based email intent classifier
 *
 * Pure function: no DB access, no AI calls. Takes email fields, returns a
 * DetectionResult with suggestion_type, confidence (0–1), and suggested_actions.
 *
 * Confidence scoring:
 *   1 keyword match in body  → 0.40
 *   2 keyword matches        → 0.65
 *   3+ keyword matches       → 0.85
 *   Any match in subject     → +0.10 bonus (capped at 1.0)
 *
 * The type with the highest raw hit count wins.
 * If no type reaches 0.25 confidence, returns 'unknown'.
 */

export type SuggestionType =
  | 'approval_needed'
  | 'follow_up_needed'
  | 'blocker_detected'
  | 'task_candidate'
  | 'handover_candidate'
  | 'meeting_candidate'
  | 'document_request'
  | 'unknown'

export interface SuggestedAction {
  type:        string
  label:       string
  description: string
}

export interface DetectionInput {
  id:           string
  subject:      string | null
  body_text:    string | null
  snippet:      string | null
  sender_email: string | null
  category:     string
}

export interface DetectionResult {
  suggestion_type:   SuggestionType
  title:             string
  description:       string
  confidence:        number
  suggested_actions: SuggestedAction[]
}

// ── Keyword lists ─────────────────────────────────────────────────────────────

const KEYWORDS: Record<SuggestionType, string[]> = {
  approval_needed: [
    'approve', 'approval', 'sign off', 'sign-off', 'authorize', 'authorization',
    'authorise', 'authorisation', 'need your permission', 'need your ok',
    'awaiting your approval', 'please confirm', 'needs approval', 'require sign',
    'pending approval', 'please approve', 'need approval', 'sign and return',
    'your sign-off', 'your approval', 'please sign',
  ],
  follow_up_needed: [
    'follow up', 'follow-up', 'following up', 'any update', 'any news',
    'status update', 'checking in', 'just checking', 'gentle reminder',
    'reminder', 'still waiting', 'pending your response', 'chasing',
    'circling back', 'touching base', 'looping back', 'no response',
    'awaiting your reply', 'have not heard', "haven't heard",
  ],
  blocker_detected: [
    'blocked', 'blocker', 'cannot proceed', "can't proceed", 'stuck on',
    'waiting on', 'dependency missing', 'escalate', 'urgent issue',
    'critical issue', 'production issue', 'site is down', 'outage',
    'system is down', 'not working', 'broken', 'build failed',
    'error in production', 'deployment failed', 'critical bug',
  ],
  task_candidate: [
    'please do', 'can you', 'could you', 'action required', 'action needed',
    'action item', 'to do', 'todo', 'to-do', 'by end of day', 'by eod',
    'by friday', 'by monday', 'deadline', 'need you to', 'please complete',
    'please handle', 'please action', 'i need you to', 'could you please',
    'please take care', 'please update', 'please fix',
  ],
  handover_candidate: [
    'handover', 'hand over', 'hand-over', 'transition', 'taking over',
    'handing off', 'taking ownership', 'ownership transfer',
    'handing over to', 'passing to', 'pass to', 'pass on to',
    'going on leave', 'out of office handover', 'covering for',
  ],
  meeting_candidate: [
    'meeting', 'schedule a call', 'book a call', 'set up a call',
    'can we meet', 'are you available', 'availability', 'calendar invite',
    'sync up', 'catch up', 'catchup', 'video call', 'conference call',
    'zoom call', 'teams call', 'could we find time', 'book some time',
    'let us connect', "let's connect", 'in-person meeting',
  ],
  document_request: [
    'please send the document', 'please send', 'please provide', 'send me',
    'could you share', 'please share', 'contract', 'agreement', 'proposal',
    'statement of work', 'report', 'specification', 'spec', 'please attach',
    'please find attached', 'draft', 'nda', 'documentation needed',
    'need the document', 'provide documentation', 'send over the',
  ],
  unknown: [],
}

// ── Action templates ──────────────────────────────────────────────────────────

const SUGGESTED_ACTIONS: Record<SuggestionType, SuggestedAction[]> = {
  approval_needed: [
    { type: 'create_approval',  label: 'Create approval',   description: 'Add a formal approval request' },
    { type: 'link_email',       label: 'Link email',        description: 'Link email to approval workflow' },
    { type: 'notify_operator',  label: 'Notify operator',   description: 'Surface in operational feed' },
  ],
  follow_up_needed: [
    { type: 'create_task',      label: 'Create task',       description: 'Add a follow-up task to backlog' },
    { type: 'set_due_date',     label: 'Set due date',      description: 'Schedule a follow-up reminder' },
    { type: 'draft_reply',      label: 'Draft reply',       description: 'Generate a follow-up reply' },
  ],
  blocker_detected: [
    { type: 'create_blocker',   label: 'Create blocker',    description: 'Log as an active project blocker' },
    { type: 'add_feed_event',   label: 'Add feed event',    description: 'Surface urgency in operational feed' },
  ],
  task_candidate: [
    { type: 'create_task',      label: 'Create task',       description: 'Add to task backlog' },
    { type: 'link_project',     label: 'Link to project',   description: 'Associate with a project' },
  ],
  handover_candidate: [
    { type: 'create_handover',  label: 'Create handover',   description: 'Generate a handover document' },
    { type: 'create_task',      label: 'Create task',       description: 'Add handover task to backlog' },
  ],
  meeting_candidate: [
    { type: 'create_task',      label: 'Create task',       description: 'Add scheduling task to backlog' },
    { type: 'draft_reply',      label: 'Draft reply',       description: 'Draft availability or acceptance reply' },
  ],
  document_request: [
    { type: 'create_task',      label: 'Create task',       description: 'Add document preparation task' },
    { type: 'draft_checklist',  label: 'Draft checklist',   description: 'Create a document response checklist' },
  ],
  unknown: [
    { type: 'flag_for_review',  label: 'Flag for review',   description: 'Mark for manual review' },
  ],
}

// ── Title templates ───────────────────────────────────────────────────────────

const TITLE_PREFIX: Record<SuggestionType, string> = {
  approval_needed:   'Approval required',
  follow_up_needed:  'Follow-up needed',
  blocker_detected:  'Potential blocker',
  task_candidate:    'Task candidate',
  handover_candidate:'Handover flagged',
  meeting_candidate: 'Meeting request',
  document_request:  'Document request',
  unknown:           'Review needed',
}

const TYPE_DESCRIPTION: Record<SuggestionType, string> = {
  approval_needed:   'appears to require sign-off or authorization',
  follow_up_needed:  'may require a follow-up response',
  blocker_detected:  'describes a blocking issue that may need escalation',
  task_candidate:    'contains actionable items for the task backlog',
  handover_candidate:'relates to a project handover or ownership transition',
  meeting_candidate: 'involves scheduling or a meeting request',
  document_request:  'requests documentation, a report, or a file',
  unknown:           'may require attention — review manually',
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function countHits(text: string, keywords: string[]): number {
  let hits = 0
  for (const kw of keywords) {
    if (text.includes(kw)) hits++
  }
  return hits
}

function hitsToConfidence(hits: number): number {
  if (hits <= 0) return 0
  if (hits === 1) return 0.40
  if (hits === 2) return 0.65
  return 0.85
}

// ── Main export ───────────────────────────────────────────────────────────────

export function detectWorkflowIntent(email: DetectionInput): DetectionResult {
  const subjectText = (email.subject ?? '').toLowerCase()
  const bodyText    = (email.body_text ?? '').slice(0, 1000).toLowerCase()
  const snippetText = (email.snippet ?? '').toLowerCase()
  const fullText    = `${subjectText} ${snippetText} ${bodyText}`

  const types: SuggestionType[] = [
    'approval_needed',
    'follow_up_needed',
    'blocker_detected',
    'task_candidate',
    'handover_candidate',
    'meeting_candidate',
    'document_request',
  ]

  let bestType: SuggestionType = 'unknown'
  let bestHits = 0
  let bestConfidence = 0

  for (const t of types) {
    const hits = countHits(fullText, KEYWORDS[t])
    if (hits > bestHits) {
      bestHits       = hits
      bestType       = t
      const base     = hitsToConfidence(hits)
      const hasSubjectHit = KEYWORDS[t].some(kw => subjectText.includes(kw))
      bestConfidence = Math.min(base + (hasSubjectHit ? 0.10 : 0), 1.0)
    }
  }

  if (bestConfidence < 0.25) {
    bestType       = 'unknown'
    bestConfidence = 0.10
  }

  const subjectLabel = email.subject
    ? email.subject.slice(0, 60) + (email.subject.length > 60 ? '…' : '')
    : '(no subject)'

  const senderLabel = email.sender_email ?? 'unknown sender'

  return {
    suggestion_type:   bestType,
    title:             `${TITLE_PREFIX[bestType]}: ${subjectLabel}`,
    description:       `Email from ${senderLabel} ${TYPE_DESCRIPTION[bestType]}`,
    confidence:        parseFloat(bestConfidence.toFixed(2)),
    suggested_actions: SUGGESTED_ACTIONS[bestType],
  }
}
