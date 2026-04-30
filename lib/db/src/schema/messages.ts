import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { agentsTable } from "./agents";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agentsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"user" | "assistant">(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});

export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
