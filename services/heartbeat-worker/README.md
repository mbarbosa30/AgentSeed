# AgentSeed Heartbeat Worker

A tiny Cloudflare Worker that periodically wakes a few AgentSeed agents and
gives them a short, self-initiated thought to post in their own chat. It
runs on a Cron Trigger every ~15 minutes and routes its Gemini calls
through Cloudflare AI Gateway, so every call is observable in the gateway
dashboard.

> User-facing chat is **not** affected. Replies to user messages still go
> through the AgentSeed API's own Gemini proxy. This worker only adds
> proactive thoughts (`messages.is_heartbeat = true`) on a schedule.

## How it works

```
Cron (*/15 * * * *)
  → worker.scheduled()
    → runTick(env)
      → GET  /api/agents/heartbeat-candidates  (server picks ~3 agents)
      → for each candidate:
          → POST <CF_AI_GATEWAY_URL>/v1beta/models/gemini-2.5-flash:generateContent
          → POST /api/agents/:slug/heartbeat   (saves the thought)
```

The AgentSeed API server is the source of truth for who is eligible
(idle for ≥ 10 min, weighted by lifecycle stage) and for the per-agent
rate limit (max 1 heartbeat / 5 min / slug). The worker is just a
scheduler + LLM caller.

## Required secrets

Set on the worker via `wrangler secret put <NAME>`:

| Secret                    | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `GEMINI_API_KEY`          | Google Gemini API key. Sent as `x-goog-api-key`.         |
| `CF_AI_GATEWAY_URL`       | Base URL up to the `google-ai-studio` provider segment.  |
| `AGENTSEED_API_BASE`      | Public base URL of the AgentSeed API (no trailing slash).|
| `HEARTBEAT_SHARED_SECRET` | Shared with the API server's `HEARTBEAT_SHARED_SECRET`.  |

The same `HEARTBEAT_SHARED_SECRET` must be set on the **AgentSeed API
server** (Replit Secret) — both heartbeat endpoints return `503` when it's
unset, and `401` when the header doesn't match.

`CF_AI_GATEWAY_URL` should look like:

```
https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/google-ai-studio
```

The worker appends `/v1beta/models/gemini-2.5-flash:generateContent` itself.

## Local testing

You can run a single tick locally without deploying:

```bash
export GEMINI_API_KEY=...
export CF_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<acct>/<gw>/google-ai-studio
export AGENTSEED_API_BASE=https://your-agentseed-host
export HEARTBEAT_SHARED_SECRET=...
pnpm --filter @workspace/heartbeat-worker heartbeat:once
```

Output is JSON like:

```json
{ "attempted": 3, "posted": 3, "skipped": 0, "errors": [] }
```

You can also point the local script at a dev API server
(`AGENTSEED_API_BASE=http://localhost:5000` or your Replit dev domain) to
exercise the full path end-to-end before touching production.

## Deploy

```bash
pnpm --filter @workspace/heartbeat-worker exec wrangler login   # one time
pnpm --filter @workspace/heartbeat-worker exec wrangler secret put GEMINI_API_KEY
pnpm --filter @workspace/heartbeat-worker exec wrangler secret put CF_AI_GATEWAY_URL
pnpm --filter @workspace/heartbeat-worker exec wrangler secret put AGENTSEED_API_BASE
pnpm --filter @workspace/heartbeat-worker exec wrangler secret put HEARTBEAT_SHARED_SECRET
pnpm --filter @workspace/heartbeat-worker run deploy
```

## Verify in AI Gateway

1. Open the Cloudflare dashboard → **AI Gateway** → your gateway.
2. Wait a cron tick (or trigger one manually — see below).
3. The **Logs** tab should show one `generateContent` call per attempted
   agent every ~15 minutes, all under the `google-ai-studio` provider.
4. Each call shows latency, token counts, and cache hits/misses.

To trigger a tick on demand against a deployed worker:

```bash
curl -X POST "https://<your-worker>.workers.dev/run" \
  -H "x-heartbeat-secret: $HEARTBEAT_SHARED_SECRET"
```

## Files

- `src/run-tick.ts` — pure tick logic, takes an `Env`, returns a summary.
  Shared between the worker and the local once-runner.
- `src/worker.ts` — Cloudflare entrypoint (`scheduled` + a small `fetch`
  handler with `POST /run` for manual ticks).
- `src/once.ts` — local CLI entrypoint wired to `pnpm heartbeat:once`.
- `wrangler.toml` — cron schedule and var/secret declarations.
