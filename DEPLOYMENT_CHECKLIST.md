# Z Command Center — Deployment Checklist

## Deployment Target Recommendation

**Railway** — not Vercel.

Reasons:
- The app runs a persistent `jobs-worker` background process (`npm run jobs:worker`) that cannot run in Vercel's serverless model.
- The browser-execution feature (`/api/browser-execution`) uses Playwright/Chromium, which requires an actual runtime — Vercel serverless functions cannot install or run headless browsers.
- The Playwright runner writes screenshots to `public/browser-screenshots/` on disk; Vercel's ephemeral filesystem would lose these between requests.
- A `railway.json` is already present in the repo and correctly configured.

Vercel could host the Next.js frontend if the jobs-worker and browser-execution features are disabled or extracted, but that requires architectural changes that are out of scope.

---

## Required Environment Variables

Set all of these in the Railway dashboard under **Service → Variables** (or via the Railway CLI).

### Supabase (REQUIRED)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — used for server-side admin operations; never exposed to the client |

### AI Provider (REQUIRED for all AI features)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key — used by Claude chat, memory extraction, Gmail triage, handover generation, weekly intelligence, workflow execution, and more |

### Gmail / Google OAuth (REQUIRED for email features)

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth 2.0 client secret |
| `GOOGLE_REDIRECT_URI` | Must be set to `https://<your-railway-domain>/api/gmail/callback` — update this after your first Railway deploy to get the assigned domain |

### Token Encryption (STRONGLY RECOMMENDED)

| Variable | Description |
|---|---|
| `ENCRYPTION_KEY` | 64 hex-character string (32 bytes) for AES-256-GCM encryption of stored Gmail tokens. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Without `ENCRYPTION_KEY`, tokens are stored as base64 (server-side only). With it, tokens are AES-256-GCM encrypted. **Do not rotate this key after Gmail accounts are connected** — rotation will break decryption of all stored tokens and require Gmail reconnection.

### Jobs Worker (OPTIONAL)

| Variable | Description |
|---|---|
| `JOB_CYCLE_SECONDS` | Poll interval for the jobs worker in seconds. Default: `60` |

### DO NOT SET IN PRODUCTION

| Variable | Reason |
|---|---|
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` | Dev-only auth bypass flag. The code guards it with `NODE_ENV === 'development'`, but do not set it at all in production to avoid confusion. |

---

## Railway Setup Steps

### 1. Create Railway project

```bash
railway login
railway init
```

Or create a new project at railway.app and connect the GitHub repo.

### 2. Set environment variables

In the Railway dashboard: **Project → Service → Variables**, add every required variable listed above.

### 3. Playwright browsers (for browser-execution feature)

Playwright is installed as an npm dependency, but its Chromium binary is not bundled with it.
Add a **custom build command** or a `nixpacks.toml` to install browsers:

Create `nixpacks.toml` in the project root:

```toml
[phases.build]
cmds = ["npm run build", "npx playwright install chromium --with-deps"]
```

Or set the Railway build command to:
```
npm run build && npx playwright install chromium --with-deps
```

Without this, the `/api/browser-execution` endpoints will fail at runtime with a "browser not found" error. All other features will work normally.

### 4. Jobs worker (background process)

The jobs worker (`npm run jobs:worker`) needs to run alongside the Next.js server. On Railway, deploy it as a **second service** in the same project pointing to the same repo, with start command:

```
npx tsx scripts/jobs-worker.ts
```

This second service needs the same `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars.

If you skip the jobs worker, scheduled operational jobs will not execute automatically. The app UI will still work, and you can trigger jobs manually via `/api/jobs/status`.

### 5. First deploy

Railway auto-detects Node.js via NIXPACKS and will:
- Run `npm install`
- Run the build command (`npm run build`)
- Start with `npm run start` (from `railway.json`)

The `railway.json` already has:
```json
{
  "build":  { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "npm run start", "restartPolicyType": "ON_FAILURE", "restartPolicyMaxRetries": 3 }
}
```

### 6. After first deploy — update GOOGLE_REDIRECT_URI

Once Railway assigns a domain (e.g. `z-command-center-production.up.railway.app`), update `GOOGLE_REDIRECT_URI` to:

```
https://z-command-center-production.up.railway.app/api/gmail/callback
```

Also add this URI to your Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs.

### 7. Custom domain (optional)

In Railway: **Service → Settings → Custom Domain**, add your domain and point DNS accordingly.

---

## Build Commands

```bash
# Type check (no errors expected)
npm run typecheck

# Production build
npm run build

# Start production server
npm run start

# Jobs worker (run as separate process / Railway service)
npm run jobs:worker

# Run jobs once (useful for testing)
npm run jobs:run-once
```

---

## Local Test Commands

```bash
# Full production build test
npm run build && npm run start

# Verify the app starts and redirects to /dashboard
curl -I http://localhost:3000

# Check auth is required (should redirect to /auth/login)
curl -I http://localhost:3000/dashboard
```

---

## Production Test Checklist

After deployment, verify the following:

- [ ] App loads at the Railway URL (redirects to `/auth/login`)
- [ ] Login with Supabase credentials works
- [ ] Dashboard loads without JS errors
- [ ] `/api/auth/me` returns a valid user profile (not 401)
- [ ] `/api/debug/runtime` responds (checks system health)
- [ ] Anthropic features work: send a message in the Z Assistant panel
- [ ] Gmail connect flow initiates at `/connections` (OAuth redirect fires)
- [ ] Gmail callback completes and stores account (`/connections` shows connected)
- [ ] Jobs worker is running (check Railway service logs)
- [ ] Browser-execution demo runs at `/browser-execution` (requires Playwright install step above)

---

## Risks and TODOs

### High risk

| Risk | Detail |
|---|---|
| `GOOGLE_REDIRECT_URI` mismatch | Gmail OAuth will break if this isn't updated to the production domain after deploy. |
| `ENCRYPTION_KEY` rotation | If tokens are already stored with a dev key, changing this key in production breaks all Gmail token decryption. Reconnect all Gmail accounts after key rotation. |
| Playwright not installed | Browser-execution feature silently fails at runtime if Chromium binaries aren't installed. See step 3 above. |

### Medium risk

| Risk | Detail |
|---|---|
| Jobs worker not deployed | Scheduled jobs won't run. Deploy as a second Railway service to fix. |
| Screenshot persistence | Playwright screenshots are written to `public/browser-screenshots/` on disk. These persist within a container instance but are lost on redeploy. Not a data loss risk, but screenshots from previous runs won't be accessible after a redeploy. |
| Supabase workspace row | The app queries a `workspaces` table for the `command-center` slug at startup (`workspace-context.ts`). If this row doesn't exist, routes that call `requireWorkspaceContext()` will throw. Run migration `011_phase3a_multi_tenant.sql` from the `supabase/` directory if it hasn't been applied. |

### Low risk

| Risk | Detail |
|---|---|
| `NEXT_PUBLIC_DEV_AUTH_BYPASS` leakage | Guarded by `NODE_ENV === 'development'` in code. Just don't set it in production. |
| `turbopack.root` in next.config.ts | Currently set to `path.resolve(__dirname)` (the project root, which is the default). Valid and harmless; no action needed. |

---

## Build Status

```
npm run typecheck  → PASSED (0 errors)
npm run build      → PASSED (51/51 pages, 0 errors)
                     Compile: 3.6min | TypeScript: 17min | Static gen: 2.9s
```

## Files Changed by This Checklist Process

- `DEPLOYMENT_CHECKLIST.md` — this file (created)
- `src/app/auth/login/page.tsx` — wrapped login form in `Suspense` boundary to satisfy Next.js static generation requirement for `useSearchParams()` (deployment blocker fix)

---

## Supabase Migrations

All 18 migrations in `supabase/migrations/` must be applied to the production Supabase project before deploying. The app will fail at runtime if migrations are missing — especially `011_phase3a_multi_tenant.sql` which creates the `workspaces` table.

Migration files (apply in order):
```
001_full_stack.sql
002_memory_ingestion.sql
005_phase2b_gmail.sql
006_phase2c_scheduled_jobs.sql
007_phase2c_inbox_workflow.sql
008_phase2c_workflow_chains.sql
009_phase2c_operational_memory.sql
010_phase2c_notifications.sql
011_phase3a_multi_tenant.sql    ← creates workspaces table (required)
012_browser_execution_sandbox.sql
013_operational_insights.sql
014_system_proof.sql
015_phase4a_operational_graph.sql
016_phase4c_intelligence.sql
017_auth_integration.sql
018_operational_memory_classification.sql
```

Apply with the Supabase CLI:
```bash
# Link to your Supabase project
supabase link --project-ref <your-project-ref>

# Check current state
supabase db diff --linked

# Push all pending migrations
supabase db push
```

Or apply them manually in the Supabase dashboard SQL editor, in order.
