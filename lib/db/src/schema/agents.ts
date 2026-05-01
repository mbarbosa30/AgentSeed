import { pgTable, text, serial, boolean, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  mission: text("mission").notNull(),
  personality: text("personality").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  lifecycleStage: text("lifecycle_stage").notNull().default("egg"),
  mood: text("mood").notNull().default("focused"),
  treasuryBalance: real("treasury_balance").notNull().default(0),
  holderCount: integer("holder_count").notNull().default(0),
  memoryPublic: boolean("memory_public").notNull().default(true),
  firstTask: text("first_task"),
  parentSlug: text("parent_slug"),
  memoryHighlights: text("memory_highlights").array().notNull().default([]),
  virtualsWalletAddress: text("virtuals_wallet_address"),
  virtualsAgentId: text("virtuals_agent_id"),
  // Travel-concierge feature: when true, the chat pipeline exposes the
  // Viator searchActivities tool to Gemini and the UI renders activity
  // cards + a "Travel concierge" badge on the agent profile.
  isTravelConcierge: boolean("is_travel_concierge").notNull().default(false),
  // Viator affiliate / partner identifier appended to outbound product
  // URLs as `?pid=` (or merged with the configured campaign id) so that
  // the agent owner gets attribution credit for the click-out.
  viatorPartnerId: text("viator_partner_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
