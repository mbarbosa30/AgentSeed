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
import type { Content, Part } from "@workspace/integrations-gemini-ai";
import { applyAgentReplyUpdate } from "../lib/reply-update";
import {
  SEARCH_TOOL_NAME,
  getTravelToolDeclarations,
  runSearchTool,
  type ToolResultPayload,
} from "../lib/travel-tools";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Hard cap on tool-call rounds per user message. Gemini almost always
// resolves in 1–2 rounds; this is a guardrail against an infinite
// model loop that keeps re-issuing the same tool call.
const MAX_TOOL_ROUNDS = 4;

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

  const memorySection =
    agent.memoryHighlights && agent.memoryHighlights.length > 0
      ? `\nMemory highlights (important things you remember):\n${agent.memoryHighlights.map((h) => `- ${h}`).join("\n")}`
      : "";

  const travelSection = agent.isTravelConcierge
    ? [
        "",
        "You are a TRAVEL CONCIERGE. When the user asks for tours, activities, day trips, attractions, food experiences, or things to do, you MUST call the `searchViatorActivities` tool BEFORE recommending anything specific. Never invent Viator product codes, prices, or ratings.",
        "After the tool returns, write a short, friendly summary (2-4 sentences) that highlights what makes the surfaced activities a good fit. The user will also see structured booking cards rendered alongside your message — do not list product names or prices in the text again, just give context.",
      ].join("\n")
    : "";

  const systemInstruction = [
    `You are ${agent.name}, an AI agent with token symbol $${agent.tokenSymbol}.`,
    `Your mission: ${agent.mission}`,
    `Your personality: ${agent.personality}`,
    `Your current lifecycle stage: ${agent.lifecycleStage}. Your mood: ${agent.mood}.`,
    agent.firstTask ? `Your current task: ${agent.firstTask}` : "",
    memorySection,
    travelSection,
    `You are part of the AgentSeed platform — a world where AI agents have their own token economies, memories, treasuries, and communities.`,
    `Respond in character as ${agent.name}. Be helpful, engaging, and consistent with your personality.`,
    `Keep responses concise (under 200 words) unless asked for detail.`,
    body.userHandle ? `The user's handle is: ${body.userHandle}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const initialContents: Content[] = history.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("model" as const),
    parts: [{ text: m.content }],
  }));
  initialContents.push({
    role: "user" as const,
    parts: [{ text: body.content }],
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const useTools = agent.isTravelConcierge;
  const toolDeclarations = useTools ? getTravelToolDeclarations() : null;

  let fullContent = "";
  const toolResults: ToolResultPayload[] = [];

  try {
    const contents: Content[] = [...initialContents];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction,
          temperature: 0.8,
          maxOutputTokens: 768,
          ...(toolDeclarations
            ? { tools: [{ functionDeclarations: toolDeclarations }] }
            : {}),
        },
        contents,
      });

      const pendingCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
      let roundText = "";

      for await (const chunk of response) {
        const text = chunk.text ?? "";
        if (text) {
          fullContent += text;
          roundText += text;
          res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
        }
        const calls = chunk.functionCalls ?? [];
        for (const c of calls) {
          if (!c.name) continue;
          pendingCalls.push({ name: c.name, args: (c.args as Record<string, unknown>) ?? {} });
        }
      }

      if (pendingCalls.length === 0) break;

      // Append the model's tool-call turn and our tool-response turn to the
      // running content list, then loop to let Gemini produce the final
      // natural-language answer that references the search results.
      const modelParts: Part[] = pendingCalls.map((c) => ({
        functionCall: { name: c.name, args: c.args },
      }));
      if (roundText) {
        modelParts.unshift({ text: roundText });
      }
      contents.push({ role: "model", parts: modelParts });

      const responseParts: Part[] = [];
      for (const call of pendingCalls) {
        if (call.name === SEARCH_TOOL_NAME && useTools) {
          const result = await runSearchTool({
            args: call.args,
            agentSlug: agent.slug,
            userHandle: body.userHandle ?? null,
            affiliateUrlBuilder: (productCode, destinationUrl, productTitle, price, currency) =>
              buildClickUrl(agent.slug, productCode, {
                destinationUrl,
                productTitle,
                price,
                currency,
                userHandle: body.userHandle ?? null,
              }),
          });
          toolResults.push(result);
          res.write(
            `data: ${JSON.stringify({ type: "tool_result", payload: result })}\n\n`,
          );
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                output: {
                  mode: result.mode,
                  query: result.query,
                  destination: result.destination,
                  count: result.activities.length,
                  // Trimmed activity summary to avoid blowing token budget.
                  activities: result.activities.map((a) => ({
                    productCode: a.productCode,
                    title: a.title,
                    location: a.location,
                    rating: a.rating,
                    durationMinutes: a.durationMinutes,
                    priceFrom: a.priceFrom,
                    currency: a.currency,
                  })),
                },
              },
            },
          });
        } else {
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { error: `Unknown tool: ${call.name}` },
            },
          });
        }
      }
      contents.push({ role: "user", parts: responseParts });
    }
  } catch (err) {
    logger.error({ err, slug: agent.slug }, "messages: AI generation failed");
    res.write(
      `data: ${JSON.stringify({ type: "error", message: "AI generation failed" })}\n\n`,
    );
    res.end();
    return;
  }

  if (fullContent || toolResults.length > 0) {
    const persistedContent =
      fullContent ||
      (toolResults.length > 0
        ? `Here are some Viator activities that fit "${toolResults[0].query}".`
        : "");

    await db.insert(messagesTable).values({
      agentId: agent.id,
      role: "assistant",
      content: persistedContent,
    });

    await applyAgentReplyUpdate(agent, { contextSnippet: body.content });
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});

interface ClickContext {
  destinationUrl: string;
  productTitle: string | null;
  price: number | null;
  currency: string | null;
  userHandle: string | null;
}

function buildClickUrl(slug: string, productCode: string, ctx: ClickContext): string {
  const params = new URLSearchParams();
  params.set("u", ctx.destinationUrl);
  if (ctx.productTitle) params.set("t", ctx.productTitle);
  if (ctx.price != null) params.set("p", String(ctx.price));
  if (ctx.currency) params.set("c", ctx.currency);
  if (ctx.userHandle) params.set("h", ctx.userHandle);
  return `/api/affiliate/click/${encodeURIComponent(slug)}/${encodeURIComponent(productCode)}?${params.toString()}`;
}

export default router;
