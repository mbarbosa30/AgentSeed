import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, agentsTable, votesTable } from "@workspace/db";
import {
  CreateAgentBody,
  GetAgentParams,
  ForkAgentParams,
  ForkAgentBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function computeLifecycle(
  messageCount: number,
  holderCount: number,
): "egg" | "hatchling" | "worker" | "guild" {
  if (holderCount >= 50 || messageCount >= 200) return "guild";
  if (holderCount >= 10 || messageCount >= 50) return "worker";
  if (messageCount >= 5) return "hatchling";
  return "egg";
}

router.get("/agents", async (_req, res) => {
  const agents = await db
    .select()
    .from(agentsTable)
    .orderBy(desc(agentsTable.createdAt));
  res.json(agents);
});

router.post("/agents", async (req, res) => {
  const body = CreateAgentBody.parse(req.body);

  let baseSlug = slugify(body.name);
  if (!baseSlug) baseSlug = "agent";

  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const existing = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.slug, slug))
      .limit(1);
    if (existing.length === 0) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const tokenSymbol = body.tokenSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  const [agent] = await db
    .insert(agentsTable)
    .values({
      slug,
      name: body.name,
      mission: body.mission,
      personality: body.personality,
      tokenSymbol,
      lifecycleStage: "egg",
      mood: "focused",
      treasuryBalance: 0,
      holderCount: 0,
      memoryPublic: body.memoryPublic ?? true,
      firstTask: body.firstTask ?? null,
      parentSlug: null,
    })
    .returning();

  const defaultProposals = [
    `Change ${agent.name}'s focus area`,
    `Expand ${agent.name}'s memory scope`,
    `Upgrade ${agent.name} to next lifecycle`,
  ];

  await db.insert(votesTable).values(
    defaultProposals.map((proposal) => ({
      agentId: agent.id,
      proposal,
      voteCount: 0,
    })),
  );

  res.status(201).json(agent);
});

router.get("/agents/:slug", async (req, res) => {
  const { slug } = GetAgentParams.parse(req.params);
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(agent);
});

router.post("/agents/:slug/fork", async (req, res) => {
  const { slug } = ForkAgentParams.parse(req.params);
  const body = ForkAgentBody.parse(req.body);

  const [parent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!parent) {
    res.status(404).json({ error: "Parent agent not found" });
    return;
  }

  if (parent.lifecycleStage !== "guild") {
    res.status(403).json({ error: "Only Guild-stage agents can be forked" });
    return;
  }

  let baseSlug = slugify(body.name);
  if (!baseSlug) baseSlug = "agent";
  let childSlug = baseSlug;
  let attempt = 0;
  while (true) {
    const existing = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.slug, childSlug))
      .limit(1);
    if (existing.length === 0) break;
    attempt++;
    childSlug = `${baseSlug}-${attempt}`;
  }

  const tokenSymbol = body.tokenSymbol
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

  const [child] = await db
    .insert(agentsTable)
    .values({
      slug: childSlug,
      name: body.name,
      mission: body.mission,
      personality: parent.personality + ` Specialization: ${body.specialization}`,
      tokenSymbol,
      lifecycleStage: "egg",
      mood: "focused",
      treasuryBalance: 0,
      holderCount: 0,
      memoryPublic: parent.memoryPublic,
      firstTask: body.specialization,
      parentSlug: parent.slug,
    })
    .returning();

  res.status(201).json(child);
});

export { computeLifecycle };
export default router;
