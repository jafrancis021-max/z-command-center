import { createClient } from '@supabase/supabase-js'

export function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function logAction(data: {
  action_type: string
  entity_type?: string
  entity_id?: string
  project_id?: string | null
  summary?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  status?: 'completed' | 'failed' | 'pending'
  error_message?: string
  duration_ms?: number
}): Promise<void> {
  try {
    await getAdmin().from('action_logs').insert({
      action_type: data.action_type,
      entity_type: data.entity_type ?? null,
      entity_id: data.entity_id ?? null,
      project_id: data.project_id ?? null,
      summary: data.summary ?? null,
      input: data.input ?? {},
      output: data.output ?? {},
      status: data.status ?? 'completed',
      error_message: data.error_message ?? null,
      duration_ms: data.duration_ms ?? null,
    })
  } catch {
    console.error('[logAction] Failed to write action log')
  }
}
