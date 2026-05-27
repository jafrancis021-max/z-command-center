# HYPE Proof Worker

Backend proof engine that scans member wallets and sends verified proof rows to the
Supabase Edge Function proxy, which upserts them into `public.hype_proofs`.

## Architecture

```
npm run hype:proofs
  └─ src/jobs/runHypeProofs.ts       entry point, loads .env.local
       └─ src/hype/worker.ts         scan loop + proxy dispatch
            ├─ src/hype/supabase.ts              wallet list (HYPE_WALLETS)
            ├─ src/hype/proxy.ts                 POST to edge function
            └─ src/hype/sources/
                 ├─ hyperliquid.ts   Hyperliquid Info API  — LIVE
                 ├─ hyperlend.ts     HyperEVM JSON-RPC     — live if HYPERLEND_POOL_ADDRESS set
                 ├─ kinetiq.ts       stHYPE balanceOf      — live if STHYPE_TOKEN_CONTRACT set
                 ├─ hyperswap.ts     subgraph              — TODO (HYPERSWAP_SUBGRAPH_URL)
                 ├─ felix.ts         Felix API             — TODO (FELIX_API_URL)
                 └─ hype_s2.ts       S2 eligibility        — TODO (no source yet)
```

```
Claude Code worker
  │  POST https://zafqnsoznoynmybhhgww.supabase.co/functions/v1/hype-proofs-upsert
  │  x-hype-worker-secret: <HYPE_WORKER_SECRET>
  ▼
Supabase Edge Function
  └─ validates secret → upserts into public.hype_proofs → Lovable UI updates
```

No Supabase service key is required. Auth is via `HYPE_WORKER_SECRET` only.

## Running

```bash
# Dry run — detect proofs, no proxy calls
DRY_RUN=true npm run hype:proofs

# Live run — send proofs to edge function
npm run hype:proofs
```

## Environment variables (.env.local)

| Variable                  | Required         | Notes                                          |
|---------------------------|------------------|------------------------------------------------|
| `HYPE_WALLETS`            | YES              | Comma-separated addresses to scan             |
| `HYPE_PROXY_URL`          | Live run only    | Edge function URL                             |
| `HYPE_WORKER_SECRET`      | Live run only    | Shared secret validated by the edge function  |
| `DRY_RUN`                 | no (default false) | true = log only, no proxy calls             |
| `HYPERLIQUID_API_URL`     | no               | Default: https://api.hyperliquid.xyz          |
| `HYPEREVM_RPC_URL`        | no               | Default: https://rpc.hyperliquid.xyz/evm      |
| `HYPERLEND_POOL_ADDRESS`  | no               | Activates Hyperlend proofs                    |
| `STHYPE_TOKEN_CONTRACT`   | no               | Activates Kinetiq stHYPE balance check        |
| `KINETIQ_STAKE_CONTRACT`  | no               | Reserved — ABI not yet implemented            |
| `HYPERSWAP_SUBGRAPH_URL`  | no               | Activates Hyperswap proofs (TODO)             |
| `FELIX_API_URL`           | no               | Activates Felix proofs (TODO)                 |

## Supported projects and proof keys

### project = `hyperliquid` — LIVE

| requirement_key  | Condition                           | value_usd       | value_text           | tx_hash                  |
|------------------|-------------------------------------|-----------------|----------------------|--------------------------|
| `collateral`     | accountValue > 0                    | accountValue    | —                    | —                        |
| `perps_deposit`  | accountValue > 0                    | accountValue    | —                    | most recent deposit hash |
| `perps_size`     | totalNtlPos > 0                     | totalNtlPos     | —                    | —                        |
| `perps_short`    | any open short position             | entry notional  | "COIN szi=X"         | —                        |
| `spot_swap`      | active spot balance or spot fills   | —               | —                    | most recent spot fill hash |
| `spot_vol`       | 7-day spot fill volume > 0          | 7-day USD vol   | —                    | —                        |
| `agent`          | has API agent(s)                    | —               | agent name(s)        | —                        |
| `agent_approve`  | has API agent(s)                    | —               | —                    | —                        |
| `activity`       | any perps/spot/fills activity       | —               | "active"             | —                        |

Notes on tx_hash:
- `perps_deposit`: sourced from `userNonFundingLedgerUpdates` (deposits in last 30 days). Null if no recent deposit.
- `spot_swap`: sourced from most recent spot fill's `hash` field. Null if no fills available.
- `agent_approve`: not available from `extraAgents` response — always null.

### project = `hyperlend` — live if `HYPERLEND_POOL_ADDRESS` configured

| requirement_key | Condition                  | value                        |
|-----------------|----------------------------|------------------------------|
| `supplied`      | totalCollateralBase > 0    | USD (8-decimal Aave base)    |
| `supply`        | totalCollateralBase > 0    | same                         |
| `borrowed`      | totalDebtBase > 0          | USD                          |
| `borrow`        | totalDebtBase > 0          | same                         |
| `hf`            | has debt, HF < type max    | health factor (4 decimals)   |
| `shared_credit` | has both supply and borrow | —                            |

### project = `kinetiq` — live if `STHYPE_TOKEN_CONTRACT` configured

| requirement_key | Condition            | value_text           |
|-----------------|----------------------|----------------------|
| `sthype_holder` | stHYPE balance > 0   | "X.XXXX stHYPE"      |
| `staked`        | stHYPE balance > 0   | "X.XXXX stHYPE"      |

### project = `hyperswap` — TODO (requires `HYPERSWAP_SUBGRAPH_URL`)

Planned keys: `swapped`, `lp`. No proofs written until subgraph URL is configured.

### project = `felix` — TODO (requires `FELIX_API_URL`)

Planned keys: `supplied`, `borrowed`. No proofs written until API URL is configured.

### project = `hype_s2` — TODO (no data source yet)

Planned keys: `eligible`, `claimed`. No proofs written until contract/API is identified.

## Supabase table contract (managed by Lovable)

```sql
wallet          text NOT NULL
project         text NOT NULL
requirement_key text NOT NULL
value_usd       numeric
value_text      text
tx_hash         text
block_number    bigint
proven_at       timestamptz NOT NULL
status          text NOT NULL DEFAULT 'proven'
notes           text
PRIMARY KEY (wallet, project, requirement_key)
```

All writes use upsert on `(wallet, project, requirement_key)` — idempotent.

## Edge function response contract

- `200 { "ok": true }` — success
- `200 { "ok": false, "error": "..." }` — upsert failed (counted as proxy failure)
- `401 / 400 / 500` — failure (retried up to 3× with exponential backoff)

## Source files

```
src/lib/hype-proofs.ts            canonical project/key constants
src/hype/types.ts                 ProofRow, WalletScanResult, ScanStats
src/hype/logger.ts                structured logger
src/hype/retry.ts                 withRetry + sleep
src/hype/wallet.ts                address validation/normalisation
src/hype/evm.ts                   shared HyperEVM JSON-RPC utilities
src/hype/supabase.ts              wallet loader (HYPE_WALLETS env var)
src/hype/proxy.ts                 POST proof rows to edge function
src/hype/sources/hyperliquid.ts   Hyperliquid Info API checks
src/hype/sources/hyperlend.ts     Hyperlend IPool checks
src/hype/sources/kinetiq.ts       stHYPE ERC-20 balance check
src/hype/sources/hyperswap.ts     Hyperswap scaffold (TODO)
src/hype/sources/felix.ts         Felix scaffold (TODO)
src/hype/sources/hype_s2.ts       HYPE S2 scaffold (TODO)
src/hype/worker.ts                scan orchestrator
src/jobs/runHypeProofs.ts         CLI entry point
```
