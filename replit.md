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

## Key Files

- `artifacts/api-server/src/routes/community.ts` — votes, tips, supporters
- `artifacts/api-server/src/routes/messages.ts` — Gemini SSE streaming chat
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

## EconomyOS / Virtuals ACP Integration

**Discovery (verified against `os.virtuals.io/llms-full.txt`):**
- There is **no** programmatic agent provisioning. Each ACP agent must be created via `acp agent create` (browser OAuth) or at `app.virtuals.io/acp/new`, then a Privy signer is added with `acp agent add-signer`.
- Per-agent runtime credentials are: `walletAddress`, Privy `walletId`, Privy `signerPrivateKey`, plus an optional `builderCode`. There is no flat API key.
- The smallest tip→on-chain hop is `acpAgent.createFundTransferJob(chainId, { providerAddress, evaluatorAddress, expiredAt, description })` which returns a `bigint` job id immediately. Settlement (setBudget → fund → submit → complete) is multi-step and runs out-of-band.

**How this app uses it:**
- One **platform-level** AcpAgent acts as the ACP Client for all tips (configured via env vars below). Each AgentSeed agent acts as the **Provider** when its `virtualsWalletAddress` is set.
- `artifacts/api-server/src/lib/acp.ts` lazy-imports the SDK only when env is configured. All failures are logged and swallowed — tips always succeed in-app.
- Tip route (`POST /api/agents/:slug/tip`) calls `tryCreateTipJob(...)` after persisting the tip; the returned `jobId` is stored on `tips.acp_job_id` and surfaced in the response (`acpJobId`, `acpChainId`) and in the toast (`⚡ EconomyOS job #...`).
- Multi-step settlement is **not** automated — it is intended to be driven by the `acp` CLI after the demo. This is documented honestly in the UI copy.

**Required env vars (all optional — feature degrades gracefully if missing):**
- `VIRTUALS_PLATFORM_WALLET_ADDRESS` — platform Client wallet address (`0x...`)
- `VIRTUALS_PLATFORM_WALLET_ID` — Privy wallet id for the above
- `VIRTUALS_PLATFORM_SIGNER_KEY` — Privy signer private key (`0x...`)
- `VIRTUALS_BUILDER_CODE` — optional builder attribution code
- `VIRTUALS_CHAIN_ID` — `84532` (Base Sepolia, default) or `8453` (Base mainnet)
- `SCOUT_VIRTUALS_WALLET_ADDRESS` — Provider wallet pinned to seeded Scout agent
- `SCOUT_VIRTUALS_AGENT_ID` — optional Virtuals Console agent id paired with above
- `VITE_VIRTUALS_CHAIN_ID` — frontend hint (`84532` default → "Basescan (Sepolia)" link, `8453` → "Basescan" mainnet link). Should match `VIRTUALS_CHAIN_ID` on the server.

**Schema additions:**
- `agents.virtuals_wallet_address` (text, nullable), `agents.virtuals_agent_id` (text, nullable)
- `tips.acp_job_id` (text, nullable), `tips.acp_chain_id` (integer, nullable)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
