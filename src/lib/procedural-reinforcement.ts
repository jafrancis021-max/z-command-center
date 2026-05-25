import { getAdmin } from '@/lib/supabase-server'
import { recordWorkflowLearningSignal } from '@/lib/workflow-learning'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProceduralPattern {
  id:                 string
  workspace_id:       string | null
  pattern_name:       string
  pattern_summary:    string
  detected_sequence:  string[]
  sequence_hash:      string
  confidence_score:   number
  occurrence_count:   number
  last_detected_at:   string
  suggested_use_case: string | null
  created_at:         string
  updated_at:         string
}

export interface DetectedSequence {
  sequence: string[]
  hash:     string
  count:    number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function hashSequence(seq: string[]): string {
  return seq.join('|')
}

// ── Core logic ─────────────────────────────────────────────────────────────────

// N-gram sliding window: finds subsequences that repeat >= 2 times
export function detectRepeatedSequences(
  eventTypes: string[],
  windowSize  = 3,
): DetectedSequence[] {
  if (eventTypes.length < windowSize) return []

  const counts = new Map<string, { sequence: string[]; count: number }>()

  for (let i = 0; i <= eventTypes.length - windowSize; i++) {
    const seq  = eventTypes.slice(i, i + windowSize)
    const hash = hashSequence(seq)
    const entry = counts.get(hash)
    if (entry) {
      entry.count++
    } else {
      counts.set(hash, { sequence: seq, count: 1 })
    }
  }

  return Array.from(counts.values())
    .filter(d => d.count >= 2)
    .map(d => ({ sequence: d.sequence, hash: hashSequence(d.sequence), count: d.count }))
    .sort((a, b) => b.count - a.count)
}

export function calculateProcedureConfidence(
  occurrenceCount: number,
  sequenceLength:  number,
): number {
  const base        = Math.min(occurrenceCount, 5) / 5
  const lengthBonus = Math.min((sequenceLength - 2) * 0.05, 0.15)
  return Math.min(Math.round((base + lengthBonus) * 1000) / 1000, 1)
}

export function summarizeProcedurePattern(sequence: string[]): string {
  const readable = sequence.map(s =>
    s.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  )
  if (readable.length === 1) return readable[0]
  return readable.join(' → ')
}

// ── DB operations ──────────────────────────────────────────────────────────────

// Scans recent workspace events, finds repeated sequences, upserts patterns
export async function detectWorkflowPatterns(
  workspaceId: string,
  windowSize   = 3,
  eventLimit   = 200,
): Promise<ProceduralPattern[]> {
  const db = getAdmin()

  const { data: events } = await db
    .from('operational_events')
    .select('event_type')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .limit(eventLimit)

  if (!events?.length) return []

  const eventTypes = (events as { event_type: string }[]).map(e => e.event_type)
  const repeated   = detectRepeatedSequences(eventTypes, windowSize)
  if (repeated.length === 0) return []

  const upserted: ProceduralPattern[] = []

  for (const seq of repeated) {
    const confidence = calculateProcedureConfidence(seq.count, seq.sequence.length)
    const summary    = summarizeProcedurePattern(seq.sequence)

    const row = {
      workspace_id:       workspaceId,
      pattern_name:       summary,
      pattern_summary:    `Detected ${seq.count}× in recent events`,
      detected_sequence:  seq.sequence,
      sequence_hash:      seq.hash,
      confidence_score:   confidence,
      occurrence_count:   seq.count,
      last_detected_at:   new Date().toISOString(),
      suggested_use_case: `Consider automating: ${summary}`,
      updated_at:         new Date().toISOString(),
    }

    const { data } = await db
      .from('procedural_workflow_patterns')
      .upsert(row, { onConflict: 'sequence_hash,workspace_id', ignoreDuplicates: false })
      .select()
      .single()

    if (data) {
      const pattern = data as unknown as ProceduralPattern
      upserted.push(pattern)
      await recordWorkflowLearningSignal({
        workspaceId,
        patternId:      pattern.id,
        signalType:     'pattern_detected',
        signalSource:   'system',
        signalStrength: pattern.confidence_score,
      })
    }
  }

  return upserted
}

export async function getProceduralSuggestions(
  workspaceId: string,
  limit        = 10,
): Promise<ProceduralPattern[]> {
  const { data } = await getAdmin()
    .from('procedural_workflow_patterns')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('confidence_score', { ascending: false })
    .limit(limit)

  return (data ?? []) as unknown as ProceduralPattern[]
}

export async function reinforceProcedurePattern(
  workspaceId:  string,
  sequenceHash: string,
): Promise<void> {
  const db = getAdmin()

  const { data: existing } = await db
    .from('procedural_workflow_patterns')
    .select('id, occurrence_count, detected_sequence')
    .eq('workspace_id', workspaceId)
    .eq('sequence_hash', sequenceHash)
    .single()

  if (!existing) return

  const row       = existing as unknown as { id: string; occurrence_count: number; detected_sequence: string[] }
  const newCount  = row.occurrence_count + 1
  const confidence = calculateProcedureConfidence(newCount, row.detected_sequence.length)

  await db
    .from('procedural_workflow_patterns')
    .update({
      occurrence_count: newCount,
      confidence_score: confidence,
      last_detected_at: new Date().toISOString(),
      updated_at:       new Date().toISOString(),
    })
    .eq('id', row.id)

  await recordWorkflowLearningSignal({
    workspaceId,
    patternId:      row.id,
    signalType:     'pattern_reinforced',
    signalSource:   'system',
    signalStrength: confidence,
  })
}
