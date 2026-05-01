-- Migration 0003: proactive heartbeat marker on assistant messages.
--
-- A Cloudflare Worker cron-trigger posts short, self-initiated "thoughts"
-- as assistant messages via POST /api/agents/:slug/heartbeat. We tag those
-- rows so the chat UI can render them with a subtle "self-initiated"
-- marker instead of dressing them as replies. Idempotent — safe to re-run.

ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "is_heartbeat" boolean NOT NULL DEFAULT false;

-- Helps `GET /agents/heartbeat-candidates` quickly skip agents whose latest
-- message is recent enough that we shouldn't wake them this tick.
CREATE INDEX IF NOT EXISTS "messages_agent_id_created_at_idx"
  ON "messages" ("agent_id", "created_at" DESC);
