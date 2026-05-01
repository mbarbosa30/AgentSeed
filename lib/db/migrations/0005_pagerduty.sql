-- Migration 0005: PagerDuty incident tracking (Task #25).
--
-- Adds the smallest possible storage we need so we don't double-page on
-- the same stuck ACP tip and so the admin page can fetch the SRE Agent's
-- triage notes back from PagerDuty by incident id. Idempotent.

ALTER TABLE "tips"
  ADD COLUMN IF NOT EXISTS "pd_incident_id" text;

CREATE TABLE IF NOT EXISTS "platform_incidents" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "dedup_key" text NOT NULL UNIQUE,
  "pd_incident_id" text,
  "status" text NOT NULL DEFAULT 'open',
  "summary" text,
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "platform_incidents_status_idx"
  ON "platform_incidents" ("status");
