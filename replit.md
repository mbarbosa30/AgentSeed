# AgentSeed

## Product Overview

AgentSeed is a full-stack web platform where anyone can create an AI agent with its own token economy, memory, treasury, community, and lifecycle.

**Core pages:**
- **Home (/)** — Hero + Create Agent form + browse all agents
- **Agent Profile (/agent/:slug)** — Chat, Stats, Community (votes/tips/supporters), Fork tabs
- **Event Mode (/event)** — Pre-built "Agents Day Scout" $SCOUT agent for Agents Day Lisbon

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (`artifacts/agentseed`, port from `$PORT`, preview at `/`)
- **API framework**: Express 5 (`artifacts/api-server`, port 8080)
- **AI**: Gemini 2.5 Flash via `@workspace/integrations-gemini-ai`
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from `lib/api-spec/openapi.yaml`)
- **Build**: esbuild (CJS bundle)

## Architecture

```
artifacts/
  agentseed/         # React+Vite frontend (port $PORT)
  api-server/        # Express 5 API (port 8080)
lib/
  db/                # Drizzle schema + client
  api-spec/          # OpenAPI spec → codegen
  api-client-react/  # Generated React Query hooks
  api-zod/           # Generated Zod validators
  integrations-gemini-ai/  # Gemini AI client
```

## API Routes

- `GET/POST /api/agents` — list / create agents
- `GET /api/agents/:slug` — get agent details
- `POST /api/agents/:slug/fork` — fork agent
- `GET/POST /api/agents/:slug/messages` — chat (POST = SSE stream)
- `POST /api/agents/:slug/votes` — submit vote
- `POST /api/agents/:slug/tip` — send tip
- `POST /api/agents/:slug/support` — add supporter
- `GET /api/agents/:slug/supporters` — list supporters
- `GET /api/agents/:slug/stats` — get stats
- `GET /api/agents/heartbeat-candidates` — Cloudflare worker only (header `x-heartbeat-secret`); returns small stage-weighted set of idle agents
- `POST /api/agents/:slug/heartbeat` — Cloudflare worker only (same header); appends a self-initiated assistant message with `is_heartbeat=true` and runs the same lifecycle/mood/memory update as a normal reply

## Key Files

- `artifacts/api-server/src/routes/community.ts` — votes, tips, supporters
- `artifacts/api-server/src/routes/messages.ts` — Gemini SSE streaming chat
- `artifacts/api-server/src/routes/heartbeat.ts` — heartbeat-candidates + per-agent heartbeat post (auth: `x-heartbeat-secret` vs `HEARTBEAT_SHARED_SECRET`)
- `services/heartbeat-worker/` — Cloudflare Worker package (cron `*/15 * * * *`) that calls Gemini through CF AI Gateway and posts thoughts back to the API. See `services/heartbeat-worker/README.md`.
- `artifacts/api-server/src/lib/summarize.ts` — auto-summarizes older messages into `memoryHighlights` every 50 messages (cap 10, oldest dropped)
- `artifacts/agentseed/src/pages/agent-profile.tsx` — agent page (chat/stats/community/fork)
- `artifacts/agentseed/src/pages/event.tsx` — Agents Day Scout event mode
- `lib/db/src/schema/conversations.ts` — votesTable, tipsTable, supportersTable
- `lib/api-zod/src/index.ts` — manually maintained barrel: `export * from "./generated/api"`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Notes

- Vite proxy: `/api` → `localhost:8080` (in agentseed/vite.config.ts)
- SCOUT agent seeded at slug `agents-day-scout` with token `$SCOUT`
- Agent lifecycle stages: egg → hatchling → worker → guild
- `lib/api-zod/src/index.ts` must NOT be overwritten by orval — keep manual export only
- esbuild does NOT externalize `@google/*` (removed from external list in api-server/build.mjs)
- esbuild **does** externalize the Virtuals SDK and its peers (`@virtuals-protocol/acp-node-v2`, `@account-kit/*`, `@alchemy/*`, `@aa-sdk/*`, `@privy-io/*`, `viem`, `ox`, `socket.io-client`, `eventsource`) so the bundle stays small and Privy worker code is loaded from `node_modules` at runtime.
- `pnpm-workspace.yaml` includes `services/*` so the Cloudflare Worker package is part of the monorepo (typecheck runs against it via the root `typecheck` script).

## Cloudflare heartbeat worker (proactive thoughts)

- **What it is:** an external Cloudflare Worker (`services/heartbeat-worker/`) on a `*/15 * * * *` Cron Trigger. Each tick calls `GET /api/agents/heartbeat-candidates` to get a stage-weighted set of idle agents, asks Gemini through Cloudflare AI Gateway for a 1-3 sentence self-initiated thought per agent, and posts each thought to `POST /api/agents/:slug/heartbeat`. Posted messages have `messages.is_heartbeat = true` and render with a subtle "self-initiated thought" badge in chat (`chat-interface.tsx`, `pages/event.tsx`).
- **What it is not:** it does **not** handle user-facing chat. User messages still hit `routes/messages.ts` and stream from the Replit-side Gemini proxy. The worker only adds proactive activity between user sessions, so AI Gateway shows real heartbeat-only traffic without contaminating the realtime chat path.
- **Auth:** both heartbeat endpoints require header `x-heartbeat-secret` matching `HEARTBEAT_SHARED_SECRET`. If the env is unset on the API server, both endpoints return `503` (fail closed).
- **Per-agent rate limit:** `routes/heartbeat.ts` enforces max 1 heartbeat / 5 min / slug via `rate-limit.ts`'s `keyBy` option, so a misconfigured cron can't spam any one agent. Skipped 429s from the limiter are counted as `skipped`, not errors, in the worker's tick summary.
- **Required API server env:** `HEARTBEAT_SHARED_SECRET` (Replit Secret).
- **Required worker env (Wrangler secrets):** `GEMINI_API_KEY`, `CF_AI_GATEWAY_URL` (up to and including `…/google-ai-studio`), `AGENTSEED_API_BASE`, `HEARTBEAT_SHARED_SECRET`.
- **Local smoke test:** `pnpm --filter @workspace/heartbeat-worker heartbeat:once` runs a single tick from your machine using `process.env`. See `services/heartbeat-worker/README.md` for the full deploy + verification flow.

## EconomyOS / Virtuals ACP Integration

**Discovery (verified against `os.virtuals.io/llms-full.txt`):**
- There is **no** programmatic agent provisioning. Each ACP agent must be created via `acp agent create` (browser OAuth) or at `app.virtuals.io/acp/new`, then a Privy signer is added with `acp agent add-signer`.
- Per-agent runtime credentials are: `walletAddress`, Privy `walletId`, Privy `signerPrivateKey`, plus an optional `builderCode`. There is no flat API key.
- The smallest tip→on-chain hop is `acpAgent.createFundTransferJob(chainId, { providerAddress, evaluatorAddress, expiredAt, description })` which returns a `bigint` job id immediately. Settlement (setBudget → fund → submit → complete) is multi-step and runs out-of-band.

**How this app uses it:**
- One **platform-level** AcpAgent acts as the ACP Client for all tips (configured via env vars below). Each AgentSeed agent acts as the **Provider** when its `virtualsWalletAddress` is set.
- `artifacts/api-server/src/lib/acp.ts` lazy-imports the SDK only when env is configured. All failures are logged and swallowed — tips always succeed in-app.
- Tip route (`POST /api/agents/:slug/tip`) calls `tryCreateTipJob(...)` before inserting the tip row so the on-chain job id can be persisted in the same `INSERT` (single round-trip, no follow-up `UPDATE`). The returned `jobId` is stored on `tips.acp_job_id` (and `acp_chain_id`) and surfaced in the response (`acpJobId`, `acpChainId`), the success toast (`⚡ EconomyOS job #...`), and the `GET /api/agents/:slug/tips` history endpoint.
- After insert, the route fires `kickSettlement(tipId)` which is a no-op unless `VIRTUALS_AUTOSETTLE_ENABLED=true` is set together with provider creds. With autosettle on, an in-process worker (`lib/acp-settlement.ts`) walks each tip job through `created → budget_set → funded → submitted → completed` using the platform AcpAgent (Client + Evaluator) and the configured provider AcpAgent. Each step is a single on-chain hop so judges see real Basescan confirmations as the agent profile UI polls the tips endpoint every 8s and renders a colour-coded badge per status. With autosettle off (default), jobs stay at `created` and can be advanced manually with the `acp` CLI off-band.
- Tip→USDC denomination is configurable via `VIRTUALS_TIP_USDC_PER_TOKEN` (default `0.001`) so the demo doesn't move meaningful funds.
- Manual cleanup: `pnpm --filter @workspace/api-server run acp:cleanup` marks any non-terminal ACP tip jobs older than `ACP_STUCK_HOURS` (default 1h) as `expired`.

**Required env vars (all optional — feature degrades gracefully if missing):**

*Platform (Client + Evaluator):*
- `VIRTUALS_PLATFORM_WALLET_ADDRESS` — platform Client wallet address (`0x...`)
- `VIRTUALS_PLATFORM_WALLET_ID` — Privy wallet id for the above
- `VIRTUALS_PLATFORM_SIGNER_KEY` — Privy signer private key (`0x...`)
- `VIRTUALS_BUILDER_CODE` — optional builder attribution code
- `VIRTUALS_CHAIN_ID` — `84532` (Base Sepolia, default) or `8453` (Base mainnet)

*Provider (recipient agent — single-provider demo):*
- `VIRTUALS_PROVIDER_WALLET_ADDRESS` — provider agent wallet (must equal the agent row's `virtuals_wallet_address`)
- `VIRTUALS_PROVIDER_WALLET_ID` — Privy wallet id for the provider
- `VIRTUALS_PROVIDER_SIGNER_KEY` — Privy signer private key for the provider

*Settlement controls:*
- `VIRTUALS_AUTOSETTLE_ENABLED` — set to `"true"` to opt into automatic on-chain settlement; default off.
- `VIRTUALS_TIP_USDC_PER_TOKEN` — USDC per in-app tip token (default `0.001`).
- `VIRTUALS_SETTLEMENT_POLL_MS` — worker poll interval in ms (default `15000`).
- `ACP_STUCK_HOURS` — cleanup script cutoff (default `1`).

*Seed + frontend:*
- `SCOUT_VIRTUALS_WALLET_ADDRESS` — Provider wallet pinned to seeded Scout agent
- `SCOUT_VIRTUALS_AGENT_ID` — optional Virtuals Console agent id paired with above
- `VITE_VIRTUALS_CHAIN_ID` — frontend hint (`84532` default → "Basescan (Sepolia)" link, `8453` → "Basescan" mainnet link). Should match `VIRTUALS_CHAIN_ID` on the server.

**Schema additions:**
- `agents.virtuals_wallet_address` (text, nullable), `agents.virtuals_agent_id` (text, nullable)
- `tips.acp_job_id` (text, nullable), `tips.acp_chain_id` (integer, nullable)
- `tips.acp_job_status` (text, default `'none'`), `tips.acp_updated_at` (timestamptz, nullable) — drive the settlement state machine.

**Per-agent wallet onboarding:**
- The `POST /api/agents` create-form accepts optional `virtualsWalletAddress` (must match `^0x[a-fA-F0-9]{40}$`, lowercased before persist) and `virtualsAgentId`. The home create form on `/` exposes both fields plus a "Provision wallet" link to `app.virtuals.io/acp/new`.
- `PATCH /api/agents/:slug` accepts a partial `UpdateAgentBody` (`virtualsWalletAddress`, `virtualsAgentId`; `null` clears) and is wired to a "Wallet pending → Attach wallet" CTA on the agent profile, plus an "Edit" affordance once a wallet is attached.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
