import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, agentsTable, votesTable } from "@workspace/db";
import {
  CreateAgentBody,
  GetAgentParams,
  ForkAgentParams,
  ForkAgentBody,
  UpdateAgentBody,
} from "@workspace/api-zod";
const router: IRouter = Router();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeWalletAddress(input: string | null | undefined): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed.toLowerCase();
}

function normalizeAgentId(input: string | null | undefined): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const trimmed = input.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizePartnerId(input: string | null | undefined): string | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, 64);
}

router.get("/agents", async (_req, res) => {
  const agents = await db
    .select()
    .from(agentsTable)
    .orderBy(desc(agentsTable.createdAt));
  res.json(agents);
});

router.post("/agents", async (req, res) => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const fieldPath = issue?.path?.join(".") ?? "body";
    res.status(400).json({
      error: `${fieldPath}: ${issue?.message ?? "Invalid request body"}`,
    });
    return;
  }
  const body = parsed.data;

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

  const walletAddress = normalizeWalletAddress(body.virtualsWalletAddress) ?? null;
  const virtualsAgentId = normalizeAgentId(body.virtualsAgentId) ?? null;
  const isTravelConcierge = body.isTravelConcierge === true;
  const viatorPartnerId = isTravelConcierge
    ? normalizePartnerId(body.viatorPartnerId) ?? null
    : null;

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
      virtualsWalletAddress: walletAddress,
      virtualsAgentId: virtualsAgentId,
      isTravelConcierge,
      viatorPartnerId,
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

router.patch("/agents/:slug", async (req, res) => {
  const { slug } = GetAgentParams.parse(req.params);
  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const fieldPath = issue?.path?.join(".") ?? "body";
    res.status(400).json({
      error: `${fieldPath}: ${issue?.message ?? "Invalid request body"}`,
    });
    return;
  }
  const body = parsed.data;

  const [existing] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const updates: Partial<typeof agentsTable.$inferInsert> = {};

  if (Object.prototype.hasOwnProperty.call(body, "virtualsWalletAddress")) {
    updates.virtualsWalletAddress = normalizeWalletAddress(body.virtualsWalletAddress) ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "virtualsAgentId")) {
    updates.virtualsAgentId = normalizeAgentId(body.virtualsAgentId) ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "isTravelConcierge")) {
    updates.isTravelConcierge = body.isTravelConcierge === true;
  }
  if (Object.prototype.hasOwnProperty.call(body, "viatorPartnerId")) {
    updates.viatorPartnerId = normalizePartnerId(body.viatorPartnerId) ?? null;
  }

  if (Object.keys(updates).length === 0) {
    res.json(existing);
    return;
  }

  const [updated] = await db
    .update(agentsTable)
    .set(updates)
    .where(eq(agentsTable.slug, slug))
    .returning();

  res.json(updated);
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

export default router;
