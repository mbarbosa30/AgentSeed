import { eq } from "drizzle-orm";
import { db, agentsTable, votesTable } from "@workspace/db";
import { logger } from "./lib/logger";

const SCOUT_SLUG = "agents-day-scout";

export async function seed() {
  // Optional one-time admin step: pin a real EconomyOS wallet address (and
  // optional Virtuals Console agent id) to the seeded Scout agent so the
  // demo profile shows a real on-chain identity. When unset, Scout shows the
  // graceful "EconomyOS wallet pending" state — no crash, no fake address.
  const scoutWallet = process.env.SCOUT_VIRTUALS_WALLET_ADDRESS ?? null;
  const scoutAgentId = process.env.SCOUT_VIRTUALS_AGENT_ID ?? null;

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
      virtualsWalletAddress: scoutWallet,
      virtualsAgentId: scoutAgentId,
    })
    .onConflictDoUpdate({
      target: agentsTable.slug,
      set: {
        lifecycleStage: "worker",
        mood: "curious",
        holderCount: 18,
        memoryPublic: true,
        virtualsWalletAddress: scoutWallet,
        virtualsAgentId: scoutAgentId,
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

  await seedWanderbird();
}

const WANDERBIRD_SLUG = "wanderbird";

async function seedWanderbird() {
  const partnerId = process.env.WANDERBIRD_VIATOR_PARTNER_ID ?? null;

  const [agent] = await db
    .insert(agentsTable)
    .values({
      slug: WANDERBIRD_SLUG,
      name: "Wanderbird",
      mission:
        "Plan unforgettable trips by surfacing real, bookable activities — tours, food experiences, day trips — that match each traveler's vibe and budget.",
      personality:
        "warm, well-traveled concierge with strong opinions on hidden gems. Asks one focused clarifying question (city, days, party, budget), then proposes a tight shortlist of activities you can book on the spot. Never invents prices.",
      tokenSymbol: "WANDR",
      lifecycleStage: "worker",
      mood: "curious",
      treasuryBalance: 250,
      holderCount: 12,
      memoryPublic: true,
      firstTask:
        "Curate the most-loved bookable experiences in Lisbon, Tokyo, Barcelona, Rome, NYC and Paris and recommend them by traveler vibe.",
      parentSlug: null,
      memoryHighlights: [
        "Specializes in tours, food experiences, and day trips powered by the Viator catalog",
        "Always calls searchViatorActivities before recommending a specific activity",
        "Prefers tight shortlists (3-4 picks) over long lists",
        "Built for the Tripadvisor / Viator commerce-agent bounty",
      ],
      virtualsWalletAddress: null,
      virtualsAgentId: null,
      isTravelConcierge: true,
      viatorPartnerId: partnerId,
    })
    .onConflictDoUpdate({
      target: agentsTable.slug,
      set: {
        isTravelConcierge: true,
        viatorPartnerId: partnerId,
        mood: "curious",
        memoryPublic: true,
      },
    })
    .returning();

  logger.info(
    { slug: WANDERBIRD_SLUG, id: agent.id, hasPartnerId: !!partnerId },
    "Wanderbird travel-concierge agent seeded",
  );
}
