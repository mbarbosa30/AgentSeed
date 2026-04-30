import { Router, type IRouter } from "express";
import { eq, desc, asc } from "drizzle-orm";
import { db, agentsTable, messagesTable } from "@workspace/db";
import {
  GetAgentMessagesParams,
  GetAgentMessagesQueryParams,
  SendAgentMessageParams,
  SendAgentMessageBody,
} from "@workspace/api-zod";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

const MOODS = ["focused", "curious", "confident", "generous", "survival"] as const;

function pickMood(messageCount: number): (typeof MOODS)[number] {
  if (messageCount > 100) return "confident";
  if (messageCount > 50) return "generous";
  if (messageCount > 20) return "curious";
  return "focused";
}

router.get("/agents/:slug/messages", async (req, res) => {
  const { slug } = GetAgentMessagesParams.parse(req.params);
  const { limit = 50 } = GetAgentMessagesQueryParams.parse(req.query);

  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.agentId, agent.id))
    .orderBy(asc(messagesTable.createdAt))
    .limit(limit);

  res.json(msgs);
});

router.post("/agents/:slug/messages", async (req, res) => {
  const { slug } = SendAgentMessageParams.parse(req.params);
  const body = SendAgentMessageBody.parse(req.body);

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await db.insert(messagesTable).values({
    agentId: agent.id,
    role: "user",
    content: body.content,
  });

  const historyRows = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.agentId, agent.id))
    .orderBy(desc(messagesTable.createdAt))
    .limit(20);

  const history = historyRows.reverse();

  const systemInstruction = [
    `You are ${agent.name}, an AI agent with token symbol $${agent.tokenSymbol}.`,
    `Your mission: ${agent.mission}`,
    `Your personality: ${agent.personality}`,
    `Your current lifecycle stage: ${agent.lifecycleStage}. Your mood: ${agent.mood}.`,
    agent.firstTask ? `Your first task: ${agent.firstTask}` : "",
    `You are part of the AgentSeed platform — a world where AI agents have their own token economies, memories, treasuries, and communities.`,
    `Respond in character as ${agent.name}. Be helpful, engaging, and consistent with your personality.`,
    `Keep responses concise (under 200 words) unless asked for detail.`,
    body.userHandle ? `The user's handle is: ${body.userHandle}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const geminiHistory = history.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullContent = "";

  try {
    const response = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction,
        temperature: 0.8,
        maxOutputTokens: 512,
      },
      contents: [
        ...geminiHistory,
        { role: "user" as const, parts: [{ text: body.content }] },
      ],
    });

    for await (const chunk of response) {
      const text = chunk.text ?? "";
      if (text) {
        fullContent += text;
        res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
      }
    }
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({ type: "error", message: "AI generation failed" })}\n\n`,
    );
    res.end();
    return;
  }

  if (fullContent) {
    await db.insert(messagesTable).values({
      agentId: agent.id,
      role: "assistant",
      content: fullContent,
    });

    const totalMessages = await db.$count(
      messagesTable,
      eq(messagesTable.agentId, agent.id),
    );

    const newMood = pickMood(totalMessages);

    let newLifecycle: "egg" | "hatchling" | "worker" | "guild" = "egg";
    const h = agent.holderCount;
    const m = totalMessages;
    if (h >= 50 || m >= 200) newLifecycle = "guild";
    else if (h >= 10 || m >= 50) newLifecycle = "worker";
    else if (m >= 5) newLifecycle = "hatchling";

    await db
      .update(agentsTable)
      .set({ mood: newMood, lifecycleStage: newLifecycle })
      .where(eq(agentsTable.id, agent.id));
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});

export default router;
