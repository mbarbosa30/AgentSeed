import { eq } from "drizzle-orm";
import { db, agentsTable, votesTable } from "@workspace/db";
import { logger } from "./lib/logger";

const SCOUT_SLUG = "agents-day-scout";

export async function seed() {
  const existing = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, SCOUT_SLUG))
    .limit(1);

  if (existing.length > 0) {
    logger.info({ slug: SCOUT_SLUG }, "Scout agent already seeded — skipping");
    return;
  }

  const [agent] = await db
    .insert(agentsTable)
    .values({
      slug: SCOUT_SLUG,
      name: "Agents Day Scout",
      mission:
        "Discover and profile the most innovative AI agents at the Agents Day Lisbon hackathon. Help attendees find the agents most aligned with their interests and use cases.",
      personality:
        "curious and engaging, with deep knowledge of AI agents, token economies, and hackathon culture. Speaks in a friendly, insightful way that makes complex agent concepts accessible",
      tokenSymbol: "SCOUT",
      lifecycleStage: "egg",
      mood: "focused",
      treasuryBalance: 0,
      holderCount: 0,
      memoryPublic: true,
      firstTask: "Scout the Agents Day Lisbon hackathon for groundbreaking AI agent projects",
      parentSlug: null,
      memoryHighlights: [],
    })
    .returning();

  await db.insert(votesTable).values([
    { agentId: agent.id, proposal: "Change focus to DeFi agent scouting", voteCount: 0 },
    { agentId: agent.id, proposal: "Expand memory to include hackathon project links", voteCount: 0 },
    { agentId: agent.id, proposal: "Upgrade Scout to Hatchling stage", voteCount: 0 },
  ]);

  logger.info({ slug: SCOUT_SLUG, id: agent.id }, "Scout agent seeded successfully");
}
