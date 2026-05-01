-- Migration: Task #16 — ACP tip-job settlement worker
--
-- Adds the columns the settlement worker uses to walk a tip job through
-- setBudget → fund → submit → complete, plus a timestamp for stuck-job
-- cleanup. Idempotent — safe to re-run.

ALTER TABLE "tips"
  ADD COLUMN IF NOT EXISTS "acp_job_status" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "acp_updated_at" timestamptz;

CREATE INDEX IF NOT EXISTS "tips_acp_job_status_idx"
  ON "tips" ("acp_job_status")
  WHERE "acp_job_id" IS NOT NULL;
