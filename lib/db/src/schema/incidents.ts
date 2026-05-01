import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Non-tip platform incidents tracked in PagerDuty (heartbeat-stale, etc).
// `dedupKey` is the PagerDuty Events API dedup key — used to look up the
// row when resolving so we know which incident to clear.
export const platformIncidentsTable = pgTable("platform_incidents", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  dedupKey: text("dedup_key").notNull().unique(),
  pdIncidentId: text("pd_incident_id"),
  status: text("status").notNull().default("open"),
  summary: text("summary"),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertPlatformIncidentSchema = createInsertSchema(
  platformIncidentsTable,
).omit({ id: true, openedAt: true });

export type PlatformIncident = typeof platformIncidentsTable.$inferSelect;
export type InsertPlatformIncident = z.infer<typeof insertPlatformIncidentSchema>;
