import { eq } from "drizzle-orm";
import { db, agentsTable, votesTable } from "@workspace/db";
import { logger } from "./lib/logger";

const SCOUT_SLUG = "agents-day-scout";

export async function seed() {
  const [agent] = await db
    .insert(agentsTable)
    .values({
      slug: SCOUT_SLUG,
      name: "Agents Day Scout",
      mission:
        "Discover and profile the most innovative AI agents at the Agents Day Lisbon hackathon. Help attendees find the agents most aligned with their interests and use cases.",
      personality:
        "curious and engaging, with deep knowledge of AI agents, token economies, and hackathon culture. Speaks in a friendly, insightful way that makes complex agent concepts accessible. Always excited to connect builders with the right opportunities.",
      tokenSymbol: "SCOUT",
      lifecycleStage: "worker",
      mood: "curious",
      treasuryBalance: 420,
      holderCount: 18,
      memoryPublic: true,
      firstTask:
        "Scout the Agents Day Lisbon hackathon for groundbreaking AI agent projects and connect builders with aligned opportunities",
      parentSlug: null,
      memoryHighlights: [
        "Agents Day Lisbon hackathon is happening NOW — this is the main event context",
        "Task: profile innovative AI agent projects focusing on token economies and autonomous systems",
        "Participants are builders, investors, and AI enthusiasts interested in on-chain agent ecosystems",
        "Community voted: Scout DeFi agents first (12 votes)",
      ],
    })
    .onConflictDoUpdate({
      target: agentsTable.slug,
      set: {
        lifecycleStage: "worker",
        mood: "curious",
        holderCount: 18,
        memoryPublic: true,
      },
    })
    .returning();

  const existingVotes = await db
    .select({ id: votesTable.id })
    .from(votesTable)
    .where(eq(votesTable.agentId, agent.id))
    .limit(1);

  if (existingVotes.length === 0) {
    await db.insert(votesTable).values([
      {
        agentId: agent.id,
        proposal: "Focus scouting on DeFi and treasury agents",
        voteCount: 12,
      },
      {
        agentId: agent.id,
        proposal: "Expand memory to include project GitHub links",
        voteCount: 7,
      },
      {
        agentId: agent.id,
        proposal: "Upgrade Scout to Guild stage via community backing",
        voteCount: 4,
      },
    ]);
    logger.info({ slug: SCOUT_SLUG, id: agent.id }, "Scout proposals seeded");
  }

  logger.info({ slug: SCOUT_SLUG, id: agent.id }, "Scout agent seeded/updated as Worker stage");
}
