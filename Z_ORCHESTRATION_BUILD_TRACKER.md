# Z Command Center — Operational Orchestration Build Tracker

> **Stack:** Next.js · Supabase · Claude API
> **Theme:** #0a0a0a bg · #f59e0b orange · #22c55e green
> **Updated:** 2026-05-24 (Phase 10.5 stabilization complete)
> **AGENTS.md rule:** Read `node_modules/next/dist/docs/` before writing code. Fire-and-forget side effects must use `after()` from `next/server`, not `void promise`.

---

## Phase Overview

| # | Phase | Status |
|---|-------|--------|
| 1 | Event-driven orchestration | ✅ complete |
| 2 | Dynamic workspace transitions | ✅ complete |
| 3 | Contextual UI morphing | ✅ complete |
| 4 | Runtime state propagation | ✅ complete |
| 5 | Workspace-scoped memory weighting | ✅ complete |
| 6 | Memory decay + freshness logic | ✅ complete |
| 7 | Retrieval telemetry dashboard | ✅ complete |
| 8 | Operational replay engine | ✅ complete |
| 9 | Procedural workflow reinforcement | ✅ complete |
| 10 | Workflow learning loops | ✅ complete |

---

## Phase 1 — Event-driven Orchestration

**Status:** ✅ complete
**Completed:** 2026-05-23

### Purpose
Create a lightweight operational event system that records important actions across Z.
Events are the foundation for replay, assistant context injection, workflow learning, and telemetry.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/operational-events.ts` | **New** — `createOperationalEvent`, `getRecentOperationalEvents`, `getEventsForEntity`, `getEventsForWorkspace` |
| `src/app/api/debug/events/route.ts` | **New** — debug endpoint returning recent events with type summary |
| `src/app/api/intake/upload/route.ts` | **Wired** — emits `vault.document_uploaded` after successful upload |
| `src/app/api/workflows/run/route.ts` | **Wired** — emits `workflow.started` after workflow execution |
| `src/app/api/assistant/chat/route.ts` | **Wired** — emits `assistant.memory_retrieved` after context assembly |

### Database Changes
**Table:** `operational_events`
```
id               UUID PK
workspace_id     UUID FK → workspaces
event_type       TEXT (e.g. vault.document_uploaded)
event_source     TEXT (intake / workflow_engine / assistant / system)
entity_type      TEXT nullable
entity_id        TEXT nullable
title            TEXT
description      TEXT nullable
metadata         JSONB
actor_id         TEXT nullable
importance_score FLOAT [0–1]
memory_mode      TEXT (episodic/procedural/runtime/…)
temperature_tier TEXT (hot/warm/cold)
created_at       TIMESTAMPTZ
```
- RLS enabled, service-role policy
- Indexes: workspace+time, event_type, entity_type+entity_id

### Event Types Created
| Event Type | Source | memory_mode | temperature_tier | importance |
|---|---|---|---|---|
| `vault.document_uploaded` | intake | episodic | hot | 0.7 |
| `workflow.started` | workflow_engine | procedural | hot | 0.6 |
| `assistant.memory_retrieved` | assistant | runtime | warm | 0.4 |

### Test Method
```bash
# 1. Trigger a vault upload via the UI or:
curl -X POST http://localhost:3000/api/intake/upload -F "file=@yourfile.txt"

# 2. Run a workflow via the UI or:
curl -X POST http://localhost:3000/api/workflows/run -H "Content-Type: application/json" \
  -d '{"template_id":"<id>"}'

# 3. Send an assistant chat message via the UI

# 4. Check events:
curl http://localhost:3000/api/debug/events
curl "http://localhost:3000/api/debug/events?event_type=vault.document_uploaded"
curl "http://localhost:3000/api/debug/events?event_type=workflow.started"
curl "http://localhost:3000/api/debug/events?event_type=assistant.memory_retrieved"
curl "http://localhost:3000/api/debug/events?entity_type=intake_document&entity_id=<id>"
```

### Risks / TODOs
- `actor_id` is unused — future: populate from auth session cookie
- `createOperationalEvent` is fire-and-forget; failures are logged to console only
- No deduplication — repeated assistant calls will accumulate many `assistant.memory_retrieved` events; consider batching or sampling in Phase 7
- `entity_id` is TEXT not UUID — intentional (workflow_run ids may not be UUIDs); enforce UUID format per entity type in a future validator

### Completion Notes
Event system is live. All 3 event types are being written. Debug endpoint `/api/debug/events` is available. No existing routes broken. typecheck passes (1 pre-existing error in `intake/route.ts` unrelated to this work).

**2026-05-23 hardening:** Upgraded all 3 event write sites from `void createOperationalEvent(...)` to `after(() => createOperationalEvent(...))` per Next.js `after()` API (stable since v15.1.0). This ensures events are written even on serverless platforms where the process might terminate immediately after the response is sent.

---

## Phase 2 — Dynamic Workspace Transitions

**Status:** ✅ complete
**Completed:** 2026-05-23

### Purpose
Make the dashboard center panel respond dynamically to user-triggered workspace mode changes
via URL search params (`?ws=<mode>`). No route changes needed — the dashboard page stays at
`/dashboard` and the workspace controller reads the param client-side.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/workspace-state.ts` | **New** — `WorkspaceMode` type, `PRIMARY_ACTIONS`, `workspaceModeUrl()`, `isWorkspaceMode()` |
| `src/components/workspace/WorkspaceController.tsx` | **New** — Client component with `Suspense` boundary, reads `?ws=` param, renders DashboardHomePanel / VaultUploadPanel / WorkflowRunPanel / EventsViewPanel / PlaceholderPanel |
| `src/app/dashboard/page.tsx` | **Updated** — Imports and renders `<WorkspaceController />` replacing static center content |

### Database Changes
None — workspace state is URL-driven, no DB writes.

### Test Method
1. Open `http://localhost:3000/dashboard` — DashboardHomePanel with 3 action buttons renders
2. Click **Add to Vault** → URL becomes `?ws=vault_upload`, upload panel renders
3. Click **Run Workflow** → URL becomes `?ws=workflow_run`, workflow cards render
4. Click **View Events** → URL becomes `?ws=events_view`, events list renders
5. Direct nav to `?ws=events_view` reloads correctly (param-driven, survives refresh)
6. Zaid assistant panel remains visible in all modes

### Risks
- `useSearchParams()` requires `Suspense` — wrapped internally in `WorkspaceController`
- VaultUploadPanel and WorkflowRunPanel make live API calls — depend on Phase 1 routes being healthy

### Completion Notes
Typecheck: only pre-existing `src/app/api/intake/route.ts(101,40)` error. All Phase 2 files clean.
No new DB tables. WorkspaceController is fully self-contained — panels are inline, no extra imports.
`navigate()` uses `router.replace()` (not `push`) to avoid polluting browser history on workspace switches.

---

## Phase 3 — Contextual UI Morphing

**Status:** ✅ complete
**Completed:** 2026-05-23

### Purpose
Make the Zaid assistant panel adapt to the active workspace mode. When the center workspace
changes (via `?ws=` URL param), Zaid shows a contextual title, guidance text, mode badge,
and relevant quick actions. Quick actions can trigger workspace transitions directly from
the assistant panel.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/assistant-ui-context.ts` | **New** — `AssistantUIContext`, `AssistantQuickAction` types; `ASSISTANT_UI_CONTEXTS` map (all 7 modes) |
| `src/components/ZAssistantPanel.tsx` | **Updated** — split into `ZAssistantPanelInner` + `Suspense` wrapper; added `useSearchParams` + `useRouter`; replaced "Start here" with workspace-context block when on `/dashboard`; added `WorkspaceQuickAction` component |

### Database Changes
None — config-driven, no DB writes.

### Test Method
1. Open `http://localhost:3000/dashboard` — Zaid shows "Operational Overview" with 3 action buttons
2. Click **Add to Vault** in center → Zaid badge changes to "Vault Intake", guidance updates, quick actions change
3. Click **Run Workflow** in center → Zaid shows "Workflow Execution" context
4. Click **View Events** in center → Zaid shows "Operational Events" context
5. In Zaid panel, click a quick action with `mode` → center workspace changes
6. Chat input remains visible and functional in all modes
7. On any non-dashboard page, Zaid shows generic "Start here" links (unchanged behavior)

### Risks
- `useSearchParams()` requires `Suspense` — handled by outer wrapper in `ZAssistantPanel`
- Quick actions with `prompt` trigger chat; ensure `send()` ref is stable (using `useCallback`)

### Completion Notes
Typecheck: only pre-existing `src/app/api/intake/route.ts(101,40)` error. All Phase 3 files clean.
`ASSISTANT_UI_CONTEXTS` is a pure data object — no branching in component code, config-driven as intended.
`WorkspaceQuickAction` renders as `<Link>` for `href` actions and `<button>` for `mode`/`prompt` actions.

---

## Phase 4 — Runtime State Propagation

**Status:** ✅ complete
**Completed:** 2026-05-23

### Purpose
Make Zaid and the assistant aware of live runtime health. When Gmail is disconnected,
system proof is stale, or jobs are stuck, Zaid surfaces a compact notice and the assistant
adjusts its recommendations to avoid suggesting actions that depend on degraded integrations.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/runtime-state.ts` | **New** — `getRuntimeState()`, `getRuntimeWarnings()`, `getRuntimeStateSummary()`, `suggestedBehaviorForWarnings()`; queries 4 sources in parallel |
| `src/app/api/debug/runtime/route.ts` | **New** — GET endpoint returning runtime status, warnings, sources, checked_at, suggested_behavior; emits `runtime.warning_detected` via `after()` |
| `src/components/ZAssistantPanel.tsx` | **Updated** — fetches `/api/debug/runtime` on mount; shows compact amber/red notice when warnings exist |
| `src/app/api/assistant/chat/route.ts` | **Updated** — runs `getRuntimeState()` in parallel with other context; injects `RUNTIME STATUS` + `RUNTIME BEHAVIOR RULES` into system prompt when degraded/critical |

### Database Changes
None — reads existing tables only: `email_accounts`, `system_proof_runs`, `scheduled_jobs`, `job_runs`, `operational_events`.

### Runtime Sources Inspected
| Source | Check | Severity |
|--------|-------|----------|
| Gmail | `email_accounts` WHERE status='connected'; stale if last_synced_at > 4h ago | disconnected=severe, stale=mild |
| System Proof | `system_proof_runs` latest row; stale if > 24h ago | stale=mild/severe, critical=severe, degraded=mild |
| Job Engine | `scheduled_jobs` stuck check (overdue > 2× interval); `job_runs` failed in last 24h | stuck=severe, failures=mild |
| Event Pipeline | `operational_events` count in last 1h | flowing=healthy (no warning emitted currently) |

### Event Types Created
| Event Type | Source | memory_mode | temperature_tier | importance |
|---|---|---|---|---|
| `runtime.warning_detected` | system | runtime | hot (severe) / warm (mild) | 0.85 / 0.55 |

### Test Method
1. `curl http://localhost:3000/api/debug/runtime` — see JSON with status, warnings, sources
2. Open `/dashboard` — if any warnings, Zaid shows amber/red notice above setup progress
3. Disconnect Gmail (or check with no email_accounts row) — Zaid shows "Gmail disconnected" notice
4. Send assistant chat message → `_debug.runtimeStatus` shows the runtime status
5. With warnings active, Z will decline to suggest email actions in chat

### Risks
- `getRuntimeState()` runs 4 parallel DB queries on every call; not cached — adds ~50–100ms to chat latency
- Event emission via debug route only — polling the debug route will accumulate `runtime.warning_detected` events; consider deduplication in Phase 7
- Gmail stale threshold is 4h — may be too sensitive for workspaces with infrequent email

### Completion Notes
No new DB tables. All queries are read-only against existing tables. `after()` used for event emission per AGENTS.md rule. ZAssistantPanel runtime notice is hidden when status = 'healthy'.

---

## Phase 5 — Workspace-scoped Memory Weighting

**Status:** ✅ complete
**Completed:** 2026-05-23

### Purpose
Make memory retrieval workspace-aware. Workspace-matched items always rank above global items
through a composite score. When workspace items are sparse, global items are pulled in as fallback
with a scoring penalty. Think Tank isolation is enforced before scoring — speculative memory
cannot be boosted by workspace weighting.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/memory-weighting.ts` | **New** — `calculateWorkspaceMemoryScore()`, `rankWorkspaceMemoryItems()`, `explainWorkspaceWeighting()`; `ScoredMemoryItem`, `RawMemoryRow`, `ScoreBreakdown` types |
| `src/lib/assistant-context-assembler.ts` | **Rewritten** — two-stage fetch (workspace first, global fallback when sparse); apply scoring via `rankWorkspaceMemoryItems()`; extended `AssistantContextPayload` with workspace stats |
| `src/app/api/debug/memory/route.ts` | **Updated** — `workspace` block with activeWorkspaceId, counts, explanation; per-item `workspace_matched`, `scope`, `workspace_score`, `score_breakdown`, `included_reason`, `deprioritized_reason` |
| `src/app/api/assistant/chat/route.ts` | **Updated** — `_debug` now includes `workspaceId`, `workspaceScopedMemoryCount`, `globalFallbackCount`, `topMemoryScore` |

### Database Changes
None — reads `operational_memory_items` using existing columns (`workspace_id`, `recency_score`, `workflow_relevance_score`, `linked_case_id`, `linked_workflow_id`).

### Scoring Rules
| Factor | Max Points | Notes |
|--------|-----------|-------|
| Workspace match | +40 | item.workspace_id === activeWorkspaceId |
| Case link | +20 | item.linked_case_id === options.caseId |
| Workflow link | +20 | item.linked_workflow_id === options.workflowId |
| Mode match | +15 | item.memory_mode in selectedModes |
| Temperature (hot) | +20 | tier = hot |
| Temperature (warm) | +12 | tier = warm |
| Temperature (cold) | +6 | tier = cold |
| Retrieval priority | 0–20 | (priority / 10) × 20 |
| Trust score | 0–15 | trust_score × 15 |
| Recency score | 0–10 | recency_score × 10 |
| Workflow relevance | 0–10 | workflow_relevance_score × 10 |
| Global fallback penalty | -10 | scope = global AND globalFallback = true |
| Cold tier penalty | -5 | temperature_tier = cold |

**Think Tank isolation**: speculative memory_mode filtered before any scoring — workspace weighting never overrides this.

### Two-Stage Fetch
- Stage 1: fetch items WHERE `workspace_id = current` (up to 20)
- If count < 3: Stage 2 also fetches items WHERE `workspace_id IS NULL` (global)
- All items scored and ranked; top 8 returned to model

### Test Method
1. `curl "http://localhost:3000/api/debug/memory?message=what+am+I+working+on"` — see `workspace` block with scoring
2. Check `items[].workspace_matched`, `items[].workspace_score`, `items[].included_reason`
3. Chat → `_debug.workspaceScopedMemoryCount` and `globalFallbackCount` reflect live state
4. With workspace items present: workspace items rank above any global items
5. Ask "brainstorm" → `speculativeBlocked: true`, no speculative items in results (Think Tank isolation intact)

### Risks
- Two-stage fetch adds a second DB query when workspace items are sparse (< 3)
- `recency_score` and `workflow_relevance_score` default to 0 if not set — scores will be lower until populated
- No per-workspace config table (original spec suggested one) — scoring weights are global constants for now

### Completion Notes
No new DB tables or columns needed. Implemented as pure scoring on top of existing data.
`AssistantContextPayload` extended — all callers updated (chat route, debug route).

---

## Phase 6 — Memory Decay + Freshness Logic

**Status:** ✅ complete
**Completed:** 2026-05-23

### Purpose
Prevent stale memory from contaminating Zaid's context by automatically cooling memory over time.
Items that are actively retrieved stay warm/hot. Items that go untouched drift cold.
High-authority, case-linked, or frequently retrieved items are protected from decay.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/memory-freshness.ts` | **New** — `calculateRecencyScore()`, `calculateRetrievalDecayFactor()`, `calculateFreshTemperatureTier()`, `shouldCoolMemoryItem()`, `explainFreshnessDecision()`, `recordMemoryRetrieval()`, `applyDecay()` |
| `src/lib/memory-weighting.ts` | **Updated** — added `authority_level`, `last_retrieved_at`, `retrieval_count` to `RawMemoryRow`; added `retrieval_bonus` to `ScoreBreakdown` (0–8 pts based on retrieval_count); added `retrievalBonus()` helper |
| `src/lib/assistant-context-assembler.ts` | **Updated** — `SELECT_COLS` now includes `authority_level`, `last_retrieved_at`, `retrieval_count` |
| `src/app/api/assistant/chat/route.ts` | **Updated** — added `after(() => recordMemoryRetrieval(...))` to track every retrieval fire-and-forget |
| `src/app/api/debug/memory-decay/route.ts` | **New** — GET (dry-run) and POST (apply) for manual decay inspection and execution |
| `src/app/api/debug/memory/route.ts` | **Updated** — per-item `freshness` block: `recency_score`, `proposed_tier`, `should_cool`, `protected`, `protection_reason`, `retrieval_count`, `days_since_retrieved`, `explanation` |
| `src/app/api/intake/route.ts` | **Fixed** — `throwOnError().catch()` → `try/catch` (PromiseLike doesn't have .catch) |

### Database Changes
**4 new columns on `operational_memory_items`:**
```
last_retrieved_at     TIMESTAMPTZ   — set when item is returned to the model
last_accessed_at      TIMESTAMPTZ   — set when item is viewed (UI-side, future)
retrieval_count       INT DEFAULT 0 — incremented atomically on every retrieval
freshness_checked_at  TIMESTAMPTZ   — timestamp of last decay run
```

**2 indexes:**
```
idx_omi_last_retrieved_at  ON operational_memory_items(last_retrieved_at)
idx_omi_freshness_checked  ON operational_memory_items(freshness_checked_at)
```

**1 stored function:**
```sql
increment_memory_retrieval(item_ids UUID[])
-- atomically: retrieval_count += 1, last_retrieved_at = now()
```

### Decay Logic
| Recency Score | Temperature Tier |
|--------------|-----------------|
| ≥ 0.65 | hot |
| ≥ 0.32 | warm |
| < 0.32 | cold |

Decay route NEVER promotes — if proposed tier > current tier, cap at current.

**Recency score curves:**
- With retrieval history: aggressive (< 1d → 1.0, < 3d → 0.9, < 7d → 0.75, ... ≥ 60d → 0.1)
- Creation/update only: gentler (< 1d → 0.9, ... ≥ 90d → 0.05)

**Retrieval decay factor (slow-decay bonus):**
| retrieval_count | decay_factor |
|----------------|-------------|
| 0 | 0.82 |
| 1–2 | 0.88 |
| 3–9 | 0.93 |
| 10–24 | 0.96 |
| ≥ 25 | 0.98 |

### Protection Rules
| Rule | Condition | Effect |
|------|-----------|--------|
| Runtime hot frozen | memory_mode='runtime' AND tier='hot' | Fully protected — no change |
| Very high authority | authority_level='very_high' AND proposed='cold' | Floor is warm |
| Case-linked | linked_case_id IS NOT NULL AND proposed='cold' | Floor is warm |
| Workflow-linked | linked_workflow_id IS NOT NULL AND proposed='cold' | Floor is warm |
| Procedural recent | memory_mode='procedural' AND last_retrieved < 7d | Protected |
| Frequently retrieved | retrieval_count ≥ 10 AND proposed='cold' | Floor is warm |

### Retrieval Bonus in Scoring (Phase 6 addition to Phase 5 weights)
| retrieval_count | bonus |
|----------------|-------|
| 0 | 0 |
| 1–2 | +2 |
| 3–9 | +4 |
| 10–24 | +6 |
| ≥ 25 | +8 |

### Test Method
1. `GET /api/debug/memory-decay` — dry-run preview of what would be cooled
2. `POST /api/debug/memory-decay` — apply decay (writes to DB)
3. `GET /api/debug/memory?message=...` — per-item `freshness` block shows proposed tier and cooling decision
4. Send chat messages → `retrieval_count` increments on returned items (check DB)
5. After 3+ days, repeat step 1 — previously retrieved items should remain warm; stale items should cool

### Risks
- `applyDecay()` processes up to 200 items per call, ordered by `freshness_checked_at NULLS FIRST` — large vaults may need multiple runs
- `retrieval_count` increments on every chat response, even if the same user sends many messages back-to-back — could inflate counts for chatty sessions
- `last_accessed_at` column reserved for future UI-side tracking — currently never written

### Completion Notes
All fire-and-forget writes use `after()` per AGENTS.md rule. Decay never promotes tiers.
Protection rules prevent decay of operationally critical items. TypeScript clean (exit 0).

---

## Phase 7 — Retrieval Telemetry Dashboard

**Status:** ✅ complete
**Completed:** 2026-05-24

### Purpose
Surface live retrieval telemetry in the dashboard so the operator can see what memory Z
retrieved, blocked, scored, or skipped on every assistant chat turn. Uses the existing
`operational_events` table — no new DB schema.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/retrieval-telemetry.ts` | **New** — `recordRetrievalTelemetry()`, `getRecentRetrievalTelemetry()`, `summarizeFromEvents()` |
| `src/app/api/debug/retrieval-telemetry/route.ts` | **New** — GET endpoint: recent events + summary (counts by intent, speculative blocked, avg score, workspace/global split, top modes) |
| `src/app/api/assistant/chat/route.ts` | **Updated** — replaced `createOperationalEvent(assistant.memory_retrieved)` after() with `recordRetrievalTelemetry()` after(); removed `createOperationalEvent` import |
| `src/components/workspace/WorkspaceController.tsx` | **Updated** — replaced `PlaceholderPanel` for `memory_debug` mode with `MemoryDebugPanel` showing live telemetry fetched from the API |
| `src/lib/assistant-ui-context.ts` | **Updated** — `memory_debug` quickActions: added "View Retrieval Telemetry" (mode: memory_debug); `dashboard_home` quickActions: added "Memory Debug" entry point |

### Database Changes
None — stores telemetry as `operational_events` rows with `event_type = 'assistant.retrieval_telemetry'` and full metadata in the existing `metadata` JSONB column.

### Telemetry Event Schema
```
event_type:   'assistant.retrieval_telemetry'
memory_mode:  'runtime'
temperature_tier: 'warm'
importance_score: 0.3
metadata: {
  intent, selected_modes, excluded_modes, speculative_blocked,
  workspace_id, workspace_scoped_count, global_fallback_count, global_fallback_used,
  top_memory_score, item_ids, item_count, temperature_dist,
  user_message_preview (first 80 chars)
}
```

### Debug API Response (`GET /api/debug/retrieval-telemetry`)
```json
{
  "checked_at": "...",
  "total": 10,
  "summary": {
    "total_retrievals": 10,
    "counts_by_intent": { "working": 6, "semantic": 3, "episodic": 1 },
    "speculative_blocked_count": 8,
    "avg_top_memory_score": 52.3,
    "workspace_pct": 70,
    "global_pct": 30,
    "top_modes": [{ "mode": "working", "count": 15 }],
    "recent_item_ids": ["uuid1", ...]
  },
  "recent": [{ "intent", "item_count", "workspace_scoped_count", "top_memory_score", ... }]
}
```

### Dashboard UI (memory_debug mode)
Panel at `?ws=memory_debug` shows:
- 3-card summary: Total Retrievals / Avg Score / Speculative Blocked
- Intent breakdown chips (color-coded by intent type)
- Workspace % vs Global % indicator
- Recent 20 retrievals: intent badge · message preview · item count · workspace split · score · timestamp
- "Refresh" button · "View raw JSON →" link to API

### Test Method
1. `GET /api/debug/retrieval-telemetry` — JSON summary (starts empty, grows with chat)
2. Send a chat message → check `/api/debug/retrieval-telemetry` → new event appears in `recent`
3. Navigate to `/dashboard?ws=memory_debug` → MemoryDebugPanel loads and shows telemetry
4. Zaid assistant panel in memory_debug mode → quick actions include "View Retrieval Telemetry"
5. Zaid assistant panel in dashboard_home → quick actions include "Memory Debug" entry point
6. Send 5+ chat messages with different questions → intent breakdown shows variety

### Risks
- `operational_events` telemetry events accumulate on every chat — purge/archival strategy TBD in Phase 9+
- `summarizeFromEvents` scans up to 200 events in-memory after DB fetch — acceptable for current volumes
- `MemoryDebugPanel` has no auto-refresh; user must click "Refresh" to see new events

### Completion Notes
No new DB tables or columns. `after()` used for telemetry per AGENTS.md rule.
Replaced previous `assistant.memory_retrieved` event with richer `assistant.retrieval_telemetry` event.
TypeScript clean (exit 0).

---

## Phase 8 — Operational Replay Engine

**Status:** ✅ complete
**Completed:** 2026-05-24

### Purpose
Reconstruct what happened across a workspace, case, or workflow from the `operational_events`
log. Grouped by day, summarized by type, and injectable into assistant context when user asks
"what happened", "show replay", or similar.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/operational-replay.ts` | **New** — `getWorkspaceReplay()`, `getEntityReplay()`, `getCaseReplay()`, `getWorkflowReplay()`, `getRecentReplayForChat()`, `summarizeReplay()`, `groupReplayEventsByDay()`, `explainReplaySequence()` |
| `src/app/api/debug/replay/route.ts` | **New** — GET with params: `workspace_id`, `entity_type`, `entity_id`, `event_type`, `limit`; returns `events`, `grouped`, `summary`, `explanation` |
| `src/lib/workspace-state.ts` | **Updated** — added `'operational_replay'` to `WorkspaceMode` union and `VALID_MODES` set |
| `src/lib/assistant-ui-context.ts` | **Updated** — added `operational_replay` context; added "View Operational Replay" quick action to `dashboard_home`, `events_view`, `memory_debug`; replaced "View Events" link with `events_view` mode action in `dashboard_home` |
| `src/components/workspace/WorkspaceController.tsx` | **Updated** — added `ReplayPanel` component; wired `operational_replay` mode |
| `src/app/api/assistant/chat/route.ts` | **Updated** — added `REPLAY_INTENT` pattern; replay events fetched in parallel; `replayCtx` injected into system prompt when user asks "what happened", "replay", "what changed", etc. |

### Database Changes
None — uses existing `operational_events` table.

### Replay Lib Functions
| Function | Description |
|----------|-------------|
| `getWorkspaceReplay(id, limit)` | All events for a workspace, ASC |
| `getEntityReplay(type, id, limit)` | Events by entity type+id, ASC |
| `getCaseReplay(caseId, limit)` | Shorthand: entity_type='operational_case' |
| `getWorkflowReplay(workflowId, limit)` | Shorthand: entity_type='workflow' |
| `getRecentReplayForChat(wsId, limit)` | Newest-first for chat injection |
| `summarizeReplay(events)` | Aggregate: totals, type counts, source counts, duration |
| `groupReplayEventsByDay(events)` | Newest-day-first, events ASC within day |
| `explainReplaySequence(events, n)` | Plain-text lines: "May 24 14:32 — event_type: title" |

### API (`GET /api/debug/replay`)
- No params → uses current workspace context (via `getCurrentWorkspaceId()`)
- `workspace_id` → filter to workspace
- `entity_type` + `entity_id` → filter to entity
- `event_type` → filter by type
- `limit` → max 200
Returns: `{ events, grouped, summary, explanation, workspace_id, filters }`

### Dashboard UI (`?ws=operational_replay`)
- 3 summary cards: Events count / First event (time ago) / Latest event (time ago)
- Event type breakdown chips
- Grouped timeline (newest day first, events ASC within day)
  - Day separator (Today / Yesterday / date)
  - Per event: tier dot · event_type · entity_type (if set) · title · time ago
- "Refresh" button · "View raw JSON →" footer link

### Quick Actions
| From | Action | Destination |
|------|--------|-------------|
| `dashboard_home` | "View Operational Replay" | `?ws=operational_replay` |
| `events_view` | "View Operational Replay" | `?ws=operational_replay` |
| `memory_debug` | "View Operational Replay" | `?ws=operational_replay` |
| `operational_replay` | "Ask What Happened" | chat prompt |

### Optional Assistant Context Injection
Triggered by: `what happened`, `show replay`, `replay`, `why did this happen`, `what changed`, `what events`, `recent activity`.
Fetches last 6 events, reverses to chronological, formats as "RECENT ACTIVITY (replay):" block.
Runs in parallel with other context fetches — zero added latency.

### Test Method
1. `GET /api/debug/replay` → returns events + grouped timeline
2. Navigate to `/dashboard?ws=operational_replay` → ReplayPanel loads with real events
3. Click "View Operational Replay" from Zaid on `dashboard_home` → navigates to panel
4. Send chat "what happened recently?" → `_debug` shows replay events in system prompt
5. Send upload → event appears in next replay refresh
6. `GET /api/debug/replay?entity_type=vault&limit=10` → filters to vault events

### Risks
- Replay is only as good as event coverage — sparse events produce thin timelines
- No entity-level filtering in the UI panel (only workspace scope) — entity filter is API-only for now
- `REPLAY_INTENT` regex activates on partial matches like "what changed" — may trigger too broadly

### Completion Notes
No new DB tables. All DB access read-only (except the chat route after() writes remain unchanged).
TypeScript clean (exit 0).

---

## Phase 9 — Procedural Workflow Reinforcement

**Status:** ✅ complete
**Completed:** 2026-05-24

### Purpose
Detect repeated operational event sequences across a workspace and turn them into reusable
procedural patterns. Patterns are stored in Supabase, surfaced in the assistant context
for "how do we usually handle this?" queries, and displayed in a new `procedural_patterns`
workspace panel. Confidence scoring rewards patterns that recur frequently and have longer sequences.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/procedural-reinforcement.ts` | **New** — 6 exported functions: `detectRepeatedSequences`, `calculateProcedureConfidence`, `summarizeProcedurePattern`, `detectWorkflowPatterns`, `getProceduralSuggestions`, `reinforceProcedurePattern` |
| `src/app/api/debug/procedural-patterns/route.ts` | **New** — GET (stored patterns) + POST (run detection) |
| `src/lib/operational-replay.ts` | **Updated** — added `getPatternAnnotationForReplay()` to check if replay events match known patterns |
| `src/lib/workspace-state.ts` | **Updated** — added `'procedural_patterns'` to `WorkspaceMode` union and `VALID_MODES` set |
| `src/lib/assistant-ui-context.ts` | **Updated** — added `procedural_patterns` context entry; "View Procedural Patterns" quick action added to `dashboard_home`, `memory_debug`, `operational_replay` |
| `src/components/workspace/WorkspaceController.tsx` | **Updated** — added `ProceduralPatternsPanel` component; wired `procedural_patterns` mode |
| `src/app/api/assistant/chat/route.ts` | **Updated** — added `PROCEDURAL_INTENT` regex; fetches and injects `KNOWN PROCEDURAL PATTERNS` block for "how do we usually handle" queries |

### Database Changes
**Table:** `procedural_workflow_patterns`
```
id                 UUID PK
workspace_id       UUID FK → workspaces ON DELETE CASCADE
pattern_name       TEXT
pattern_summary    TEXT
detected_sequence  TEXT[]
sequence_hash      TEXT (unique per workspace_id)
confidence_score   NUMERIC(4,3) [0–1]
occurrence_count   INTEGER
last_detected_at   TIMESTAMPTZ
suggested_use_case TEXT nullable
created_at         TIMESTAMPTZ
updated_at         TIMESTAMPTZ
```
- Unique index on `(sequence_hash, workspace_id)` — prevents duplicate patterns
- Index on `(workspace_id, last_detected_at DESC)` — fast workspace lookups
- RLS enabled, service-role full-access policy

### Key Algorithms
**N-gram sliding window** (`detectRepeatedSequences`):
- Slides a window of size `windowSize` (default 3) over the `event_type` array
- Counts each n-gram's occurrences; returns any with count ≥ 2, sorted by frequency

**Confidence scoring** (`calculateProcedureConfidence`):
- `base = min(occurrenceCount, 5) / 5` — saturates at 5 occurrences = 100% base
- `lengthBonus = min((seqLen - 2) × 0.05, 0.15)` — longer sequences bonus
- Final: `min(base + lengthBonus, 1.0)` — clamped to [0, 1]

**Pattern injection** (assistant chat):
- `PROCEDURAL_INTENT` regex: `/\b(how do we usually|usual(ly)?|standard procedure|typical(ly)?|pattern|workflow pattern|how (should|do) we handle)\b/i`
- When matched, fetches top-5 patterns and injects `KNOWN PROCEDURAL PATTERNS:` block into system prompt

### Test Method
```bash
# 1. Run detection (needs events in DB first):
curl -X POST http://localhost:3000/api/debug/procedural-patterns \
  -H "Content-Type: application/json" -d '{"windowSize":3,"eventLimit":200}'

# 2. View stored patterns:
curl http://localhost:3000/api/debug/procedural-patterns

# 3. Test assistant injection:
# In chat, ask: "How do we usually handle document uploads?"
# → Z should mention known procedural patterns in the response

# 4. UI: Dashboard → View Procedural Patterns tile → ProceduralPatternsPanel
# Click "Run Detection" to trigger detection from the UI
```

### Risks
- Pattern detection requires ≥ 2 occurrences of the same n-gram — empty workspaces will find nothing
- `reinforceProcedurePattern` is defined but not auto-called — wiring to event hooks is Phase 10
- `getPatternAnnotationForReplay` is defined and exported but not yet called in the API layer (available for future use)
- Patterns are not deduplicated across window sizes — a 3-gram and 4-gram starting at the same offset both get stored

### Completion Notes
TypeScript typecheck passes clean (exit code 0, no errors). All 9 `WorkspaceMode` variants covered in `ASSISTANT_UI_CONTEXTS`. `procedural_patterns` workspace mode fully wired in URL routing, WorkspaceController, and assistant UI contexts.

---

## Phase 10 — Workflow Learning Loops

**Status:** ✅ complete
**Completed:** 2026-05-24

### Purpose
Close the loop between completed operations, detected procedures, assistant suggestions, and
future workflow improvements. Z tracks whether procedures are useful, repeated, ignored, or
need improvement via typed learning signals. No autonomous execution — supervised learning from
operational history with human-readable improvement suggestions.

### Files Touched
| File | Change |
|------|--------|
| `src/lib/workflow-learning.ts` | **New** — 6 exported functions + `LearningSignalType` union (10 signal types), `WorkflowLearningSignal`, `LearningSummary`, `LearningLoopSummary` interfaces |
| `src/app/api/debug/workflow-learning/route.ts` | **New** — GET (loop summary + patterns + signals + score + improvements) + POST (record test signal + recompute) |
| `src/lib/procedural-reinforcement.ts` | **Updated** — `detectWorkflowPatterns` awaits `recordWorkflowLearningSignal('pattern_detected')`; `reinforceProcedurePattern` awaits `recordWorkflowLearningSignal('pattern_reinforced')` |
| `src/app/api/assistant/chat/route.ts` | **Updated** — `after(() => recordWorkflowLearningSignal('assistant_suggested_procedure'))` when procedural patterns injected |
| `src/lib/workspace-state.ts` | **Updated** — `'workflow_learning'` added to `WorkspaceMode` union + `VALID_MODES` |
| `src/lib/assistant-ui-context.ts` | **Updated** — `workflow_learning` context entry added; "View Workflow Learning" quick action added to `dashboard_home`, `procedural_patterns`, `operational_replay` |
| `src/components/workspace/WorkspaceController.tsx` | **Updated** — `WorkflowLearningPanel` + `LearningScoreBar` sub-component; wired `workflow_learning` mode |

### Database Changes
**Table:** `workflow_learning_signals`
```
id              UUID PK
workspace_id    UUID FK → workspaces ON DELETE CASCADE
pattern_id      UUID nullable (soft ref to procedural_workflow_patterns)
workflow_id     TEXT nullable
case_id         TEXT nullable
signal_type     TEXT NOT NULL
signal_source   TEXT NOT NULL DEFAULT 'system'
signal_strength NUMERIC(4,3) DEFAULT 1.0
notes           TEXT nullable
metadata        JSONB DEFAULT '{}'
created_at      TIMESTAMPTZ
```
- Indexes: `(workspace_id, created_at DESC)`, `pattern_id` (partial, non-null), `signal_type`, `created_at DESC`
- RLS enabled, service-role policy

### Learning Signal Types
| Signal | Source | Strength | Effect |
|--------|--------|----------|--------|
| `pattern_detected` | system | confidence_score | positive |
| `pattern_reinforced` | system | confidence_score | positive |
| `user_viewed_pattern` | user | 1.0 | positive |
| `workflow_completed` | user/system | 1.0 | positive |
| `workflow_repeated` | user/system | 1.0 | positive |
| `assistant_suggested_procedure` | assistant | 1.0 | positive |
| `user_approved_procedure` | user | 1.0 | positive (strong) |
| `user_ignored_suggestion` | user | 1.0 | negative |
| `workflow_failed` | system | 1.0 | negative |
| `user_rejected_procedure` | user | 1.0 | negative |

### Learning Score Formula
```
pos = sum(max(0, WEIGHT[type]) × strength for each signal)
neg = sum(max(0, -WEIGHT[type]) × strength for each signal)
score = pos / (pos + neg + 1)   // ∈ [0, 1]
```
Weights: `user_approved_procedure`=0.25, `workflow_completed`=0.20, `workflow_repeated`/`pattern_reinforced`=0.15, `pattern_detected`=0.10, `user_viewed_pattern`/`assistant_suggested_procedure`=0.05. Negative: `workflow_failed`/`user_rejected_procedure`=-0.10, `user_ignored_suggestion`=-0.05.

### Test Method
```bash
# 1. Run pattern detection (creates pattern_detected signals):
curl -X POST http://localhost:3000/api/debug/procedural-patterns \
  -H "Content-Type: application/json" -d '{"windowSize":3}'

# 2. View learning summary:
curl http://localhost:3000/api/debug/workflow-learning

# 3. Record a test signal:
curl -X POST http://localhost:3000/api/debug/workflow-learning \
  -H "Content-Type: application/json" \
  -d '{"signalType":"user_approved_procedure","notes":"Manual approval test"}'

# 4. Ask Z a procedural question (creates assistant_suggested_procedure signal):
# In the assistant chat: "How do we usually handle this?"

# 5. UI: Dashboard → View Workflow Learning tile → WorkflowLearningPanel
# Shows: learning score bar, signal counts, suggested improvements, recent signals
```

### Risks / TODOs
- ~~`workflow_completed` / `workflow_failed` / `workflow_repeated` not yet auto-emitted~~ → **WIRED in Phase 10.5** (see below)
- `user_viewed_pattern` / `user_ignored_suggestion` / `user_approved_procedure` / `user_rejected_procedure` not yet triggered from UI actions — currently only recordable via POST to debug route
- `reinforceProcedurePattern` is defined and emits `pattern_reinforced` but is not auto-called (no caller wired up yet)
- Learning score normalizes against `pos + neg + 1` — a workspace with no signals scores 0, not 0.5; this is intentional (cold-start = unlearned)

### Completion Notes
TypeScript typecheck passes clean (exit code 0, zero bytes output). All 10 `WorkspaceMode` variants covered in `ASSISTANT_UI_CONTEXTS`. Circular import between `procedural-reinforcement.ts` → `workflow-learning.ts` is runtime-safe: the reverse direction uses `import type` (erased at build time). Two signals auto-fire in production: `pattern_detected` on detection run, `assistant_suggested_procedure` via `after()` when procedural context injected.

---

## Phase 10.5 — Stabilization Pass

**Status:** ✅ complete
**Completed:** 2026-05-24

### Purpose
Hardening, verification, and consistency pass across all Phases 1–10. No new features. Fix type-safety gaps, wire known TODOs that were low-risk, and validate the full system.

### Checks Run
| # | Check | Result |
|---|-------|--------|
| 1 | `npm run typecheck` (baseline) | ✅ exit 0, no errors |
| 2 | Broken imports across routes | ✅ none found |
| 3 | `after()` usage consistency | ✅ all fire-and-forget correctly use `after()` |
| 4 | Workspace mode consistency | ✅ 10 modes in `WorkspaceMode`, 10 in `ASSISTANT_UI_CONTEXTS`, 10 wired in `WorkspaceController` |
| 5 | `MODE_BADGE_COLOR` in `ZAssistantPanel.tsx` | ⚠ Missing `operational_replay`, `procedural_patterns`, `workflow_learning` → **Fixed** |
| 6 | `workflow_completed/failed/repeated` wiring | ⚠ Not wired → **Fixed** (low-risk, `result.success` already available) |
| 7 | DB table existence | ✅ All 3 tables confirmed in Supabase: `operational_events` (14 cols), `procedural_workflow_patterns` (12 cols), `workflow_learning_signals` (11 cols) |
| 8 | Dashboard page load path | ✅ `dashboard/page.tsx` → `WorkspaceController` → mode panels |
| 9 | ZAssistantPanel integration | ✅ Loaded in root layout, reads `ASSISTANT_UI_CONTEXTS` correctly |
| 10 | Route stability (replay, telemetry, runtime, learning) | ✅ All 4 debug routes clean |
| 11 | Duplicate logic | ℹ `REPLAY_SELECT` defined in both `operational-replay.ts` and `debug/replay/route.ts` — intentional isolation, acceptable |
| 12 | Final typecheck (with all fixes) | ✅ exit 0, no errors |

### Files Changed
| File | Change |
|------|--------|
| `src/components/ZAssistantPanel.tsx` | Added `operational_replay`, `procedural_patterns`, `workflow_learning` to `MODE_BADGE_COLOR` |
| `src/app/api/workflows/run/route.ts` | Wired `workflow_completed`/`workflow_failed` via `after()` post-execution; wired `workflow_repeated` via async `after()` with prior-run DB count check |

### Issues Remaining (Not Fixed — Low Priority)
- `user_viewed_pattern` / `user_ignored_suggestion` / `user_approved_procedure` / `user_rejected_procedure` require UI button wiring — deferred to Lovable UI polish
- `reinforceProcedurePattern` has no auto-caller — left for future workflow integration
- `getPatternAnnotationForReplay` exported but no consumer yet — available for future use
- `event_type` is still `workflow.started` even for completed runs (pre-existing naming; changing would break replay event history)

### System Readiness
All 10 workspace modes are consistent across `workspace-state.ts`, `ASSISTANT_UI_CONTEXTS`, `WorkspaceController`, and `ZAssistantPanel`. All 3 DB tables exist. TypeScript is clean. The system is ready for Lovable UI polish.
