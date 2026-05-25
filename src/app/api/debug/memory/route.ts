import { NextRequest, NextResponse } from 'next/server'
import { assembleAssistantContext } from '@/lib/assistant-context-assembler'
import { inferRetrievalIntent, getMemoryModesForIntent, getRelevantMemoryLayers } from '@/lib/retrieval-policy'
import { getCurrentWorkspaceId } from '@/lib/workspace-context'
import { explainFreshnessDecision } from '@/lib/memory-freshness'
import type { FreshnessInput } from '@/lib/memory-freshness'

export const dynamic = 'force-dynamic'

// GET /api/debug/memory?message=<user+message>&path=<pathname>&caseId=&workflowId=
// Returns the full retrieval decision tree + workspace scoring breakdown.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const message    = searchParams.get('message')    ?? 'what am I working on'
  const pathname   = searchParams.get('path')       ?? undefined
  const caseId     = searchParams.get('caseId')     ?? undefined
  const workflowId = searchParams.get('workflowId') ?? undefined
  const workspaceId = await getCurrentWorkspaceId()

  const intent        = inferRetrievalIntent(message)
  const selectedModes = getMemoryModesForIntent(intent)
  const layers        = getRelevantMemoryLayers(message, { pathname })

  const ALL_MODES = ['working', 'episodic', 'semantic', 'procedural', 'runtime', 'speculative'] as const
  const speculativeBlocked = intent !== 'speculative'
  const excludedModes = speculativeBlocked ? ['speculative'] : []
  const activeModes   = selectedModes.filter(m => !excludedModes.includes(m as never))

  // Full assembly with workspace scoring
  const payload = await assembleAssistantContext(message, workspaceId, { pathname, caseId, workflowId })

  return NextResponse.json({
    query: {
      message,
      pathname:   pathname   ?? null,
      caseId:     caseId     ?? null,
      workflowId: workflowId ?? null,
      workspaceId,
    },
    intent: {
      inferred:    intent,
      explanation: intentExplanation(intent),
    },
    modes: {
      all:      ALL_MODES,
      selected: activeModes,
      excluded: excludedModes,
    },
    layers: {
      considered:      layers,
      thinkTankBlocked: speculativeBlocked,
    },
    workspace: {
      activeWorkspaceId:    workspaceId,
      workspaceScopedCount: payload.workspaceScopedCount,
      globalFallbackCount:  payload.globalFallbackCount,
      globalFallbackUsed:   payload.globalFallbackUsed,
      topMemoryScore:       payload.topMemoryScore,
      explanation:          payload.weightingExplanation,
    },
    temperatureWeighting: payload.temperatureWeighting,
    speculativeBlocked,
    items: payload.items.map(item => {
      // Phase 6 — freshness decision per item
      const freshnessInput: FreshnessInput = {
        id:                     item.id,
        title:                  item.title,
        memory_mode:            item.memory_mode,
        memory_layer:           item.memory_layer,
        authority_level:        item.authority_level ?? 'standard',
        temperature_tier:       item.temperature_tier,
        recency_score:          item.recency_score ?? 0,
        retrieval_decay_factor: 0.9,
        retrieval_count:        item.retrieval_count ?? 0,
        linked_case_id:         item.linked_case_id ?? null,
        linked_workflow_id:     item.linked_workflow_id ?? null,
        status:                 'active',
        created_at:             new Date().toISOString(),
        updated_at:             new Date().toISOString(),
        last_retrieved_at:      item.last_retrieved_at ?? null,
        last_accessed_at:       null,
        freshness_checked_at:   null,
      }
      const freshness = explainFreshnessDecision(freshnessInput)

      return {
        id:               item.id,
        title:            item.title,
        memory_mode:      item.memory_mode,
        memory_layer:     item.memory_layer,
        temperature_tier: item.temperature_tier,
        category:         item.category,
        trust_score:      item.trust_score,
        retrieval_priority: item.retrieval_priority,
        content_preview:  (item.content as string).slice(0, 100),
        // Phase 5 — workspace scoring
        workspace_matched:    item.scope === 'workspace',
        scope:                item.scope,
        workspace_score:      item.workspace_score,
        score_breakdown:      item.score_breakdown,
        included_reason:      item.included_reason,
        deprioritized_reason: item.deprioritized_reason,
        // Phase 6 — freshness
        freshness: {
          recency_score:       freshness.proposed_recency_score,
          proposed_tier:       freshness.proposed_tier,
          should_cool:         freshness.should_cool,
          protected:           freshness.protected,
          protection_reason:   freshness.protection_reason,
          retrieval_count:     freshness.retrieval_count,
          days_since_retrieved: freshness.days_since_retrieved,
          explanation:         freshness.explanation,
        },
      }
    }),
    totalItemsSelected: payload.items.length,
  })
}

function intentExplanation(intent: string): string {
  const map: Record<string, string> = {
    working:    'User is asking about current active work / what is in progress',
    episodic:   'User is asking about past events / what happened',
    semantic:   'User is asking for background knowledge / what we know',
    procedural: 'User is asking how to do something / what the process is',
    runtime:    'User is asking about system health / operational status',
    speculative: 'User explicitly requested brainstorming or Think Tank context',
  }
  return map[intent] ?? 'Unknown intent'
}
