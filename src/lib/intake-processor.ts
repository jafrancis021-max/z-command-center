// Pure deterministic intake classification — no AI, no external calls

export type IntakeFileType    = 'pdf' | 'docx' | 'txt' | 'csv' | 'image' | 'note' | 'other'
export type IntakeCategory    = 'claim' | 'contract' | 'compliance' | 'invoice' | 'report' | 'correspondence' | 'incident' | 'general'
export type SuggestedWorkflow = 'claim_processing' | 'contract_review' | 'compliance_check' | 'invoice_approval' | 'document_review' | 'incident_response' | 'general_intake'

export interface ProcessedIntake {
  file_type:          IntakeFileType
  detected_category:  IntakeCategory
  suggested_workflow: SuggestedWorkflow
  extracted_summary:  string
  case_type:          string
}

// ── File type detection ───────────────────────────────────────────────────────

export function detectFileType(filename: string, mimeType?: string | null): IntakeFileType {
  const ext  = filename.split('.').pop()?.toLowerCase() ?? ''
  const mime = (mimeType ?? '').toLowerCase()

  if (ext === 'pdf'  || mime.includes('pdf'))                       return 'pdf'
  if (ext === 'docx' || ext === 'doc' || mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx'
  if (ext === 'txt'  || mime === 'text/plain')                      return 'txt'
  if (ext === 'csv'  || mime.includes('csv'))                       return 'csv'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) || mime.startsWith('image/')) return 'image'
  return 'other'
}

// ── Category keyword scoring ──────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<IntakeCategory, string[]> = {
  claim:          ['claim', 'clm', 'loss', 'damage', 'injury', 'accident', 'compensation', 'indemnity', 'reimbursement'],
  contract:       ['contract', 'agreement', 'terms', 'conditions', 'mou', 'nda', 'sla', 'retainer', 'mandate', 'addendum'],
  compliance:     ['compliance', 'regulation', 'policy', 'procedure', 'audit', 'kyc', 'aml', 'gdpr', 'popia', 'fica', 'sanction'],
  invoice:        ['invoice', 'inv', 'receipt', 'payment', 'bill', 'statement', 'quote', 'quotation', 'fee', 'proforma'],
  report:         ['report', 'summary', 'brief', 'analysis', 'review', 'assessment', 'evaluation', 'update', 'minutes'],
  correspondence: ['letter', 'correspondence', 'memo', 'notice', 'communication', 'notification', 'response', 'reply'],
  incident:       ['incident', 'breach', 'failure', 'outage', 'error', 'issue', 'problem', 'escalation', 'complaint', 'dispute'],
  general:        [],
}

export function detectCategory(filename: string, text?: string | null): IntakeCategory {
  const haystack = (filename + ' ' + (text ?? '')).toLowerCase().replace(/[_\-\.]/g, ' ')
  const scores: Record<IntakeCategory, number> = {
    claim: 0, contract: 0, compliance: 0, invoice: 0,
    report: 0, correspondence: 0, incident: 0, general: 0,
  }
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [IntakeCategory, string[]][]) {
    for (const kw of keywords) {
      if (haystack.includes(kw)) scores[cat] += 1
    }
  }
  const best = (Object.entries(scores) as [IntakeCategory, number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : 'general'
}

// ── Workflow + case type maps ─────────────────────────────────────────────────

const WORKFLOW_MAP: Record<IntakeCategory, SuggestedWorkflow> = {
  claim:          'claim_processing',
  contract:       'contract_review',
  compliance:     'compliance_check',
  invoice:        'invoice_approval',
  report:         'document_review',
  correspondence: 'document_review',
  incident:       'incident_response',
  general:        'general_intake',
}

const CASE_TYPE_MAP: Record<IntakeCategory, string> = {
  claim:          'claim',
  contract:       'contract',
  compliance:     'compliance',
  invoice:        'invoice',
  report:         'general',
  correspondence: 'correspondence',
  incident:       'incident',
  general:        'general',
}

// ── Size formatter ────────────────────────────────────────────────────────────

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return 'unknown size'
  if (bytes < 1024)          return `${bytes} B`
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Main processor ────────────────────────────────────────────────────────────

export function processIntake(
  filename:  string,
  mimeType?: string | null,
  fileSize?: number | null,
  text?:     string | null,
): ProcessedIntake {
  const file_type          = detectFileType(filename, mimeType)
  const detected_category  = detectCategory(filename, text)
  const suggested_workflow = WORKFLOW_MAP[detected_category]
  const case_type          = CASE_TYPE_MAP[detected_category]
  const baseName           = filename.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ')

  const extracted_summary = [
    `File: ${baseName}`,
    `Type: ${file_type.toUpperCase()}`,
    `Category: ${detected_category}`,
    `Size: ${formatBytes(fileSize)}`,
    text ? `Preview: ${text.slice(0, 200).trim()}` : null,
  ].filter(Boolean).join(' · ')

  return { file_type, detected_category, suggested_workflow, extracted_summary, case_type }
}
