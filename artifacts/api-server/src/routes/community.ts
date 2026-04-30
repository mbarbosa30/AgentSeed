import { Router, type IRouter } from "express";
import { eq, and, desc, sql, sum, count } from "drizzle-orm";
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

function computeLifecycle(holderCount: number, messageCount: number): "egg" | "hatchling" | "worker" | "guild" {
  if (holderCount >= 50 || messageCount >= 200) return "guild";
  if (holderCount >= 10 || messageCount >= 50) return "worker";
  if (messageCount >= 5) return "hatchling";
  return "egg";
}

function pickMood(holderCount: number, tipCount: number): "focused" | "curious" | "confident" | "generous" | "survival" {
  if (holderCount >= 50 || tipCount >= 20) return "confident";
  if (holderCount >= 20 || tipCount >= 10) return "generous";
  if (holderCount >= 5 || tipCount >= 3) return "curious";
  return "focused";
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
    .select({ id: agentsTable.id, memoryHighlights: agentsTable.memoryHighlights })
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
    .where(and(eq(votesTable.id, body.proposalId), eq(votesTable.agentId, agent.id)))
    .returning();

  if (!vote) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  if (vote.voteCount >= 5) {
    const highlight = `Community mission: "${vote.proposal}" (${vote.voteCount} votes)`;
    const existing = agent.memoryHighlights ?? [];
    const filtered = existing.filter((h) => !h.startsWith(`Community mission: "${vote.proposal}"`));
    const updated = [...filtered, highlight].slice(-10);
    await db
      .update(agentsTable)
      .set({ memoryHighlights: updated })
      .where(eq(agentsTable.id, agent.id));
  }

  res.json(vote);
});

router.post("/agents/:slug/proposals", async (req, res) => {
  const slug = req.params.slug;
  const rawProposal = (req.body as { proposal?: string }).proposal;

  if (!rawProposal || typeof rawProposal !== "string" || rawProposal.trim().length < 5) {
    res.status(400).json({ error: "Proposal must be at least 5 characters" });
    return;
  }

  const proposalText = rawProposal.trim();

  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [newProposalRow] = await db
    .insert(votesTable)
    .values({
      agentId: agent.id,
      proposal: proposalText,
      voteCount: 0,
    })
    .returning();

  res.status(201).json(newProposalRow);
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

  const allTips = await db
    .select()
    .from(tipsTable)
    .where(eq(tipsTable.agentId, agent.id));

  const totalTipCount = allTips.length;
  const totalTipAmount = allTips.reduce((acc, t) => acc + t.amount, 0);

  const isBuybackTip = totalTipCount % 5 === 0;
  let addedToTreasury: number;

  if (isBuybackTip) {
    const burnAmount = body.amount * 0.2;
    addedToTreasury = body.amount - burnAmount;
  } else {
    addedToTreasury = body.amount;
  }

  const newBalance = agent.treasuryBalance + addedToTreasury;
  const burnEvents = Math.floor(totalTipCount / 5);

  await db
    .update(agentsTable)
    .set({ treasuryBalance: newBalance })
    .where(eq(agentsTable.id, agent.id));

  res.json({
    treasuryBalance: newBalance,
    holderCount: agent.holderCount,
    totalTips: totalTipAmount,
    burnEvents,
    isBuybackTip,
  });
});

router.post("/agents/:slug/support", async (req, res) => {
  const { slug } = AddSupporterParams.parse(req.params);
  const body = AddSupporterBody.parse(req.body);

  const [agent] = await db
    .select()
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

  const newHolderCount = agent.holderCount + 1;
  const totalMessages = await db.$count(messagesTable, eq(messagesTable.agentId, agent.id));
  const totalTips = await db.$count(tipsTable, eq(tipsTable.agentId, agent.id));
  const newLifecycle = computeLifecycle(newHolderCount, totalMessages);
  const newMood = pickMood(newHolderCount, totalTips);

  const newHighlight = `New supporter: @${body.nickname}`;
  const existing = agent.memoryHighlights ?? [];
  const updated = [...existing, newHighlight].slice(-10);

  await db
    .update(agentsTable)
    .set({
      holderCount: newHolderCount,
      lifecycleStage: newLifecycle,
      mood: newMood,
      memoryHighlights: updated,
    })
    .where(eq(agentsTable.id, agent.id));

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
  const buybackBurnEvents = Math.floor(tipsReceived / 5);

  const allVotes = await db
    .select()
    .from(votesTable)
    .where(eq(votesTable.agentId, agent.id));

  const activeVotes = allVotes.length;
  const totalVotesCast = allVotes.reduce((acc, v) => acc + v.voteCount, 0);

  const supporterCount = await db.$count(
    supportersTable,
    eq(supportersTable.agentId, agent.id),
  );

  const topVote = allVotes.sort((a, b) => b.voteCount - a.voteCount)[0];

  const uniqueSessions = Math.max(1, Math.ceil(totalMessages / 6));
  const tasksCompleted = agent.firstTask && totalMessages >= 3 ? 1 : 0;

  const usefulnessScore = Math.min(
    100,
    Math.round(
      totalMessages * 1 +
        tipsReceived * 5 +
        supporterCount * 10 +
        buybackBurnEvents * 3 +
        totalVotesCast * 0.5 +
        totalTipAmount * 0.05,
    ),
  );

  const supply = supporterCount + agent.holderCount;

  res.json({
    totalMessages,
    tasksCompleted,
    memoryHighlights: (agent.memoryPublic ? agent.memoryHighlights : []) ?? [],
    uniqueSessions,
    tipsReceived,
    totalTipAmount,
    buybackBurnEvents,
    activeVotes,
    supporterCount,
    topVoteProposal: topVote?.proposal ?? null,
    topVoteCount: topVote?.voteCount ?? 0,
    usefulnessScore,
    lifecycleStage: agent.lifecycleStage,
    mood: agent.mood,
    bondingCurvePoints: bondingCurvePoints(supply),
  });
});

export default router;
