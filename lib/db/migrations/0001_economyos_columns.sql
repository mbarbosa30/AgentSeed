-- Migration: Task #15 — Real EconomyOS / Virtuals ACP integration
--
-- This project uses `drizzle-kit push` (see scripts/post-merge.sh) to apply
-- schema changes on every merge, so the canonical schema lives in
-- `lib/db/src/schema/`. This SQL file is committed alongside as an explicit
-- migration artifact for environments that need to upgrade an existing
-- database manually (idempotent — safe to re-run).

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "virtuals_wallet_address" text,
  ADD COLUMN IF NOT EXISTS "virtuals_agent_id" text;

ALTER TABLE "tips"
  ADD COLUMN IF NOT EXISTS "acp_job_id" text,
  ADD COLUMN IF NOT EXISTS "acp_chain_id" integer;

-- Optional helpful index for tip-history endpoint sorting.
CREATE INDEX IF NOT EXISTS "tips_agent_id_created_at_idx"
  ON "tips" ("agent_id", "created_at" DESC);
