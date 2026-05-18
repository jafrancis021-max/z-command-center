import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedSeverity } from '@/types'

export interface FeedEventInput {
  project_id?: string | null
  event_type: string
  title: string
  description?: string | null
  severity?: FeedSeverity
  source_table?: string | null
  source_id?: string | null
  metadata?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function emitFeedEvent(db: SupabaseClient<any>, event: FeedEventInput): Promise<void> {
  try {
    await db.from('operational_feed_events').insert({
      project_id: event.project_id ?? null,
      event_type: event.event_type,
      title: event.title,
      description: event.description ?? null,
      severity: event.severity ?? 'info',
      source_table: event.source_table ?? null,
      source_id: event.source_id ?? null,
      metadata: event.metadata ?? {},
    })
  } catch {
    // Feed events are non-critical — never let them break the caller
  }
}
