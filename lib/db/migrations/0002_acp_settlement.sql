-- Migration: Task #16 — ACP tip-job settlement worker
--
-- Adds the columns the settlement worker uses to walk a tip job through
-- setBudget → fund → submit → complete, plus a timestamp for stuck-job
-- cleanup. Idempotent — safe to re-run.

ALTER TABLE "tips"
  ADD COLUMN IF NOT EXISTS "acp_job_status" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "acp_updated_at" timestamptz;

-- Backfill: legacy rows that already have an on-chain ACP job id from
-- task #15 (when the only status was implicitly "created") need their
-- status promoted from the new default `'none'` so the settlement worker
-- will actually pick them up. Idempotent and safe to re-run.
UPDATE "tips"
   SET "acp_job_status" = 'created',
       "acp_updated_at" = COALESCE("acp_updated_at", "created_at")
 WHERE "acp_job_id" IS NOT NULL
   AND "acp_job_status" = 'none';

CREATE INDEX IF NOT EXISTS "tips_acp_job_status_idx"
  ON "tips" ("acp_job_status")
  WHERE "acp_job_id" IS NOT NULL;
