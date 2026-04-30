import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, agentsTable, votesTable, tipsTable, supportersTable, messagesTable } from "@workspace/db";
import {
  GetAgentVotesParams,
  SubmitVoteParams,
  SubmitVoteBody,
  SendTipParams,
  SendTipBody,
  AddSupporterParams,
  AddSupporterBody,
  GetAgentSupportersParams,
  GetAgentStatsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function bondingCurvePoints(supply: number): Array<{ t: number; price: number; supply: number }> {
  const points = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = Math.round(supply * t);
    const price = 0.0001 * Math.pow(s + 1, 1.5);
    points.push({ t, price: Math.round(price * 10000) / 10000, supply: s });
  }
  return points;
}

router.get("/agents/:slug/votes", async (req, res) => {
  const { slug } = GetAgentVotesParams.parse(req.params);
  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const votes = await db
    .select()
    .from(votesTable)
    .where(eq(votesTable.agentId, agent.id))
    .orderBy(desc(votesTable.voteCount));

  res.json(votes);
});

router.post("/agents/:slug/votes", async (req, res) => {
  const { slug } = SubmitVoteParams.parse(req.params);
  const body = SubmitVoteBody.parse(req.body);

  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [vote] = await db
    .update(votesTable)
    .set({ voteCount: sql`${votesTable.voteCount} + 1` })
    .where(eq(votesTable.id, body.proposalId))
    .returning();

  if (!vote) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  res.json(vote);
});

router.post("/agents/:slug/tip", async (req, res) => {
  const { slug } = SendTipParams.parse(req.params);
  const body = SendTipBody.parse(req.body);

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await db.insert(tipsTable).values({
    agentId: agent.id,
    fromHandle: body.fromHandle ?? null,
    amount: body.amount,
  });

  const burnAmount = body.amount * 0.1;
  const addedAmount = body.amount - burnAmount;
  const newBalance = agent.treasuryBalance + addedAmount;

  await db
    .update(agentsTable)
    .set({
      treasuryBalance: newBalance,
      holderCount: agent.holderCount + 1,
    })
    .where(eq(agentsTable.id, agent.id));

  const allTips = await db
    .select()
    .from(tipsTable)
    .where(eq(tipsTable.agentId, agent.id));

  const totalTips = allTips.reduce((acc, t) => acc + t.amount, 0);
  const burnEvents = allTips.length;

  res.json({
    treasuryBalance: newBalance,
    holderCount: agent.holderCount + 1,
    totalTips,
    burnEvents,
  });
});

router.post("/agents/:slug/support", async (req, res) => {
  const { slug } = AddSupporterParams.parse(req.params);
  const body = AddSupporterBody.parse(req.body);

  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [supporter] = await db
    .insert(supportersTable)
    .values({
      agentId: agent.id,
      nickname: body.nickname,
      tokens: body.tokens ?? 100,
    })
    .returning();

  res.status(201).json(supporter);
});

router.get("/agents/:slug/supporters", async (req, res) => {
  const { slug } = GetAgentSupportersParams.parse(req.params);
  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const supporters = await db
    .select()
    .from(supportersTable)
    .where(eq(supportersTable.agentId, agent.id))
    .orderBy(desc(supportersTable.tokens));

  res.json(supporters);
});

router.get("/agents/:slug/stats", async (req, res) => {
  const { slug } = GetAgentStatsParams.parse(req.params);

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const totalMessages = await db.$count(
    messagesTable,
    eq(messagesTable.agentId, agent.id),
  );

  const allTips = await db
    .select()
    .from(tipsTable)
    .where(eq(tipsTable.agentId, agent.id));

  const tipsReceived = allTips.length;
  const totalTipAmount = allTips.reduce((acc, t) => acc + t.amount, 0);

  const activeVotes = await db.$count(
    votesTable,
    eq(votesTable.agentId, agent.id),
  );

  const supporterCount = await db.$count(
    supportersTable,
    eq(supportersTable.agentId, agent.id),
  );

  const usefulnessScore = Math.min(
    100,
    Math.round(
      totalMessages * 0.5 +
        tipsReceived * 5 +
        supporterCount * 10 +
        totalTipAmount * 0.1,
    ),
  );

  const supply = supporterCount + agent.holderCount;

  res.json({
    totalMessages,
    uniqueSessions: Math.max(1, Math.ceil(totalMessages / 8)),
    tipsReceived,
    totalTipAmount,
    activeVotes,
    supporterCount,
    usefulnessScore,
    lifecycleStage: agent.lifecycleStage,
    mood: agent.mood,
    bondingCurvePoints: bondingCurvePoints(supply),
  });
});

export default router;
