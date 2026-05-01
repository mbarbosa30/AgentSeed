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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
