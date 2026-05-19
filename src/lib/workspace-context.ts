import { getAdmin } from './supabase-server'

// Module-level cache — single process, single workspace for now
let cachedDefaultId: string | null = null

/**
 * Returns the ID of the default "Command Center" workspace.
 * Result is cached in-process after the first call.
 */
export async function getDefaultWorkspaceId(): Promise<string | null> {
  if (cachedDefaultId) return cachedDefaultId
  const { data } = await getAdmin()
    .from('workspaces')
    .select('id')
    .eq('slug', 'command-center')
    .single()
  cachedDefaultId = (data as { id: string } | null)?.id ?? null
  return cachedDefaultId
}

/**
 * Returns the current workspace ID.
 * Single-user fallback: always returns the default workspace.
 */
export async function getCurrentWorkspaceId(): Promise<string | null> {
  return getDefaultWorkspaceId()
}

/**
 * Returns the current workspace ID or throws if none found.
 * Use in routes that require a workspace to be configured.
 */
export async function requireWorkspaceContext(): Promise<string> {
  const id = await getDefaultWorkspaceId()
  if (!id) throw new Error('No workspace found — apply migration 011_phase3a_multi_tenant.sql')
  return id
}

/**
 * Appends a workspace_id equality filter to any Supabase query builder.
 * Safe to call — if the column doesn't exist the DB will return an error
 * that callers can catch rather than returning unfiltered data.
 */
export function withWorkspaceFilter<
  T extends { eq: (col: string, val: string) => T },
>(query: T, workspaceId: string): T {
  return query.eq('workspace_id', workspaceId)
}
