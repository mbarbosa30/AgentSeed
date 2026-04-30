import { integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { agentsTable } from "./agents";

export const votesTable = pgTable("votes", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  proposal: text("proposal").notNull(),
  voteCount: integer("vote_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertVoteSchema = createInsertSchema(votesTable).omit({
  id: true,
  createdAt: true,
});

export type Vote = typeof votesTable.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;

export const tipsTable = pgTable("tips", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  fromHandle: text("from_handle"),
  amount: real("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertTipSchema = createInsertSchema(tipsTable).omit({
  id: true,
  createdAt: true,
});

export type Tip = typeof tipsTable.$inferSelect;
export type InsertTip = z.infer<typeof insertTipSchema>;

export const supportersTable = pgTable("supporters", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  tokens: real("tokens").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertSupporterSchema = createInsertSchema(supportersTable).omit({
  id: true,
  createdAt: true,
});

export type Supporter = typeof supportersTable.$inferSelect;
export type InsertSupporter = z.infer<typeof insertSupporterSchema>;
