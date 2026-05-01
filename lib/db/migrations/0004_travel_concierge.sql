-- Migration 0004: travel-concierge agents + Viator affiliate click log.
--
-- Adds two columns to `agents` so any agent can be flagged as a travel
-- concierge with its own Viator affiliate id, and a new
-- `affiliate_clicks` table that records every click-out from a Viator
-- activity card in chat (the bounty's qualified click-out loop).
--
-- Idempotent — safe to re-run.

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "is_travel_concierge" boolean NOT NULL DEFAULT false;

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "viator_partner_id" text;

CREATE TABLE IF NOT EXISTS "affiliate_clicks" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_id" integer NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "product_code" text NOT NULL,
  "product_title" text,
  "user_handle" text,
  "price" real,
  "currency" text,
  "est_commission" real,
  "destination_url" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Lookup pattern: "show me an agent's recent click-outs" / lifetime stats.
CREATE INDEX IF NOT EXISTS "affiliate_clicks_agent_id_created_at_idx"
  ON "affiliate_clicks" ("agent_id", "created_at" DESC);
