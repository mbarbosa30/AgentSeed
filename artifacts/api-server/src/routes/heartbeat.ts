import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  agentsTable,
  messagesTable,
  tipsTable,
  type Agent,
} from "@workspace/db";
import {
  HeartbeatBody,
  HeartbeatParams,
  HeartbeatCandidatesQueryParams,
} from "@workspace/api-zod";
import { progressLifecycle } from "../lib/lifecycle";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

const HEARTBEAT_HEADER = "x-heartbeat-secret";

/**
 * Shared-secret auth for heartbeat endpoints. The Cloudflare Worker holds
 * the same secret as a Wrangler-managed binding. We refuse to accept any
 * request when the secret is unset on the server, so a misconfigured
 * deployment fails closed instead of silently allowing anonymous writes.
 */
function requireHeartbeatSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.HEARTBEAT_SHARED_SECRET;
  if (!expected) {
    res
      .status(503)
      .json({ error: "Heartbeat endpoint disabled (HEARTBEAT_SHARED_SECRET unset)" });
    return;
  }
  const provided = req.header(HEARTBEAT_HEADER);
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Invalid or missing heartbeat secret" });
    return;
  }
  next();
}

// Per-agent rate limit: at most 1 heartbeat per 5 minutes for any single
// slug. The cron is intended to fire every ~15 minutes anyway, so this
// just stops a misconfigured cron (e.g. * * * * *) from spamming a single
// agent's chat history.
const heartbeatLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 1,
  name: "heartbeat",
  keyBy: (req) => req.params.slug ?? null,
});

function pickMood(holderCount: number, tipCount: number): "focused" | "curious" | "confident" | "generous" | "survival" {
  if (holderCount >= 50 || tipCount >= 20) return "confident";
  if (holderCount >= 20 || tipCount >= 10) return "generous";
  if (holderCount >= 5 || tipCount >= 3) return "curious";
  return "focused";
}

router.post(
  "/agents/:slug/heartbeat",
  requireHeartbeatSecret,
  heartbeatLimiter,
  async (req, res) => {
    const paramsParsed = HeartbeatParams.safeParse(req.params);
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    const bodyParsed = HeartbeatBody.safeParse(req.body);
    if (!bodyParsed.success) {
      const issue = bodyParsed.error.issues[0];
      res.status(400).json({
        error: `${issue?.path?.join(".") ?? "body"}: ${issue?.message ?? "Invalid body"}`,
      });
      return;
    }
    const { slug } = paramsParsed.data;
    const { thought } = bodyParsed.data;

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.slug, slug))
      .limit(1);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const [inserted] = await db
      .insert(messagesTable)
      .values({
        agentId: agent.id,
        role: "assistant",
        content: thought,
        isHeartbeat: true,
      })
      .returning();

    // Heartbeats count toward growth too — they prove the agent is alive
    // between user sessions, which is exactly what the lifecycle is meant
    // to reward. We mirror the same update path that user replies use.
    const totalMessages = await db.$count(messagesTable, eq(messagesTable.agentId, agent.id));
    const totalTips = await db.$count(tipsTable, eq(tipsTable.agentId, agent.id));
    const progression = progressLifecycle(agent.lifecycleStage, {
      messageCount: totalMessages,
      holderCount: agent.holderCount,
      tipCount: totalTips,
    });
    const newMood = pickMood(agent.holderCount, totalTips);

    const existingHighlights = agent.memoryHighlights ?? [];
    const updatedHighlights =
      progression.advanced && progression.highlight
        ? [...existingHighlights, progression.highlight].slice(-10)
        : existingHighlights;

    await db
      .update(agentsTable)
      .set({
        mood: newMood,
        lifecycleStage: progression.stage,
        treasuryBalance: agent.treasuryBalance + progression.treasuryReward,
        memoryHighlights: updatedHighlights,
      })
      .where(eq(agentsTable.id, agent.id));

    logger.info(
      { slug, messageId: inserted.id, lifecycleStage: progression.stage },
      "Heartbeat thought posted",
    );

    res.status(201).json({
      messageId: inserted.id,
      createdAt: inserted.createdAt.toISOString(),
      lifecycleStage: progression.stage,
      lifecycleAdvanced: progression.advanced,
    });
  },
);

// Lifecycle weighting: higher-stage agents get woken more often so guilds
// audibly outpace eggs. These are relative weights for a weighted random
// pick — exact values don't matter, just the ratio.
const STAGE_WEIGHT: Record<string, number> = {
  egg: 1,
  hatchling: 2,
  worker: 4,
  guild: 8,
};

function pickWeighted<T>(
  items: T[],
  weight: (item: T) => number,
  count: number,
): T[] {
  const pool = items.slice();
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((acc, it) => acc + Math.max(0, weight(it)), 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0, weight(pool[i]));
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

router.get(
  "/agents/heartbeat-candidates",
  requireHeartbeatSecret,
  async (req, res) => {
    const queryParsed = HeartbeatCandidatesQueryParams.safeParse(req.query);
    if (!queryParsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const limit = queryParsed.data.limit ?? 3;
    const minIdleMinutes = queryParsed.data.minIdleMinutes ?? 10;
    const cutoffMs = Date.now() - minIdleMinutes * 60_000;

    // Subquery: most-recent message timestamp per agent. We use that to
    // skip agents that just posted (either a reply or a previous heartbeat),
    // so heartbeats don't pile up.
    const lastActivityRows = await db
      .select({
        agentId: messagesTable.agentId,
        lastActivityAt: sql<Date>`max(${messagesTable.createdAt})`.as("last_activity_at"),
      })
      .from(messagesTable)
      .groupBy(messagesTable.agentId);

    const lastActivityMap = new Map<number, Date>(
      lastActivityRows.map((r) => [r.agentId, r.lastActivityAt as Date]),
    );

    const allAgents = await db
      .select()
      .from(agentsTable)
      .orderBy(desc(agentsTable.createdAt));

    type Candidate = Agent & { lastActivityAt: Date | null };
    const eligible: Candidate[] = [];
    for (const agent of allAgents) {
      const last = lastActivityMap.get(agent.id) ?? null;
      // Skip agents that have spoken (or self-spoken) inside the idle window.
      if (last && last.getTime() > cutoffMs) continue;
      eligible.push({ ...agent, lastActivityAt: last });
    }

    const picked = pickWeighted(
      eligible,
      (a) => STAGE_WEIGHT[a.lifecycleStage] ?? 1,
      Math.min(limit, eligible.length),
    );

    res.json(
      picked.map((a) => ({
        slug: a.slug,
        name: a.name,
        mission: a.mission,
        personality: a.personality,
        lifecycleStage: a.lifecycleStage,
        mood: a.mood,
        memoryHighlights: a.memoryHighlights ?? [],
        lastActivityAt: a.lastActivityAt ? a.lastActivityAt.toISOString() : null,
      })),
    );
  },
);

export default router;
