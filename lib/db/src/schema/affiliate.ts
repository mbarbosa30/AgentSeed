import { integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { agentsTable } from "./agents";

/**
 * Per-click affiliate attribution log for travel-concierge agents.
 *
 * Each row corresponds to a single click on a "Book on Viator" CTA in the
 * AgentSeed chat UI. The user is bounced through
 * `GET /api/affiliate/click/:slug/:productCode` which records the row and
 * 302-redirects to the real Viator product URL with the agent's affiliate
 * id attached, preserving the bounty's "qualified click-out" loop.
 *
 * `estCommission` is a coarse, locally-computed estimate (price * rate,
 * default 8%). Real commission only materializes once Viator's monthly
 * reporting confirms a booking — that reconciliation is out of scope for
 * the bounty submission per the task description.
 */
export const affiliateClicksTable = pgTable("affiliate_clicks", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  productCode: text("product_code").notNull(),
  productTitle: text("product_title"),
  userHandle: text("user_handle"),
  price: real("price"),
  currency: text("currency"),
  estCommission: real("est_commission"),
  destinationUrl: text("destination_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertAffiliateClickSchema = createInsertSchema(affiliateClicksTable).omit({
  id: true,
  createdAt: true,
});

export type AffiliateClick = typeof affiliateClicksTable.$inferSelect;
export type InsertAffiliateClick = z.infer<typeof insertAffiliateClickSchema>;
