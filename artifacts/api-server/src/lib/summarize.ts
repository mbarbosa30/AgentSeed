import { eq, asc } from "drizzle-orm";
import { db, agentsTable, messagesTable, type Agent, type Message } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { logger } from "./logger";

export const RECENT_WINDOW = 20;
export const SUMMARIZE_EVERY = 50;
export const MAX_HIGHLIGHTS = 10;

export function shouldSummarize(totalMessages: number): boolean {
  return totalMessages >= SUMMARIZE_EVERY && totalMessages % SUMMARIZE_EVERY === 0;
}

export function computeSummarizationRange(totalMessages: number): { offset: number; limit: number } {
  const offset = Math.max(0, totalMessages - SUMMARIZE_EVERY - RECENT_WINDOW);
  const limit = Math.min(SUMMARIZE_EVERY, totalMessages - RECENT_WINDOW);
  return { offset, limit };
}

function formatTranscript(msgs: Pick<Message, "role" | "content">[]): string {
  return msgs
    .map((m) => `${m.role === "user" ? "User" : "Me"}: ${m.content}`)
    .join("\n");
}

function buildSummarizerInstruction(agent: Pick<Agent, "name" | "personality" | "mission" | "memoryPublic">): string {
  const visibility = agent.memoryPublic
    ? "These notes will be shown publicly on your profile, so they can reference user handles and concrete moments."
    : "These notes are private to you. Keep them abstract — do not name specific users or quote their messages verbatim.";

  return [
    `You are ${agent.name}. Your mission: ${agent.mission}.`,
    `Personality: ${agent.personality}.`,
    `You are reviewing a chunk of older conversation history and writing ONE compact memory highlight (1–2 sentences, under 220 characters) that captures the gist of what happened — recurring themes, decisions made, relationships formed, or progress on your mission.`,
    `Write in first person, in character as ${agent.name}. Do not include quotes, bullet points, dates, or markdown. Output only the highlight text itself, nothing else.`,
    visibility,
  ].join("\n");
}

export async function summarizeOlderMessages(agent: Agent, totalMessages: number): Promise<string | null> {
  if (!shouldSummarize(totalMessages)) return null;

  const { offset, limit } = computeSummarizationRange(totalMessages);
  if (limit <= 0) return null;

  const olderMessages = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.agentId, agent.id))
    .orderBy(asc(messagesTable.createdAt))
    .offset(offset)
    .limit(limit);

  if (olderMessages.length === 0) return null;

  const transcript = formatTranscript(olderMessages);
  const systemInstruction = buildSummarizerInstruction(agent);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction,
      temperature: 0.5,
      maxOutputTokens: 160,
    },
    contents: [
      {
        role: "user" as const,
        parts: [
          {
            text: `Here is a chunk of ${olderMessages.length} older messages from our conversation. Summarize them into a single memory highlight in your own voice:\n\n${transcript}`,
          },
        ],
      },
    ],
  });

  const summary = (response.text ?? "").trim().replace(/^["']|["']$/g, "");
  if (!summary) return null;

  const truncated = summary.length > 240 ? summary.slice(0, 237) + "…" : summary;
  return truncated;
}

export async function appendMemoryHighlight(agentId: number, highlight: string): Promise<string[]> {
  const [latest] = await db
    .select({ memoryHighlights: agentsTable.memoryHighlights })
    .from(agentsTable)
    .where(eq(agentsTable.id, agentId))
    .limit(1);
  const current = latest?.memoryHighlights ?? [];
  const updated = [...current, highlight].slice(-MAX_HIGHLIGHTS);
  await db
    .update(agentsTable)
    .set({ memoryHighlights: updated })
    .where(eq(agentsTable.id, agentId));
  return updated;
}

export async function maybeSummarizeAndStore(agent: Agent, totalMessages: number): Promise<void> {
  if (!shouldSummarize(totalMessages)) return;

  try {
    const highlight = await summarizeOlderMessages(agent, totalMessages);
    if (!highlight) return;
    await appendMemoryHighlight(agent.id, highlight);
    logger.info(
      {
        agentId: agent.id,
        slug: agent.slug,
        totalMessages,
        highlightLength: highlight.length,
        ...(agent.memoryPublic ? { highlight } : {}),
      },
      "Stored auto-summarized memory highlight",
    );
  } catch (err) {
    logger.warn(
      { err, agentId: agent.id, slug: agent.slug, totalMessages },
      "Failed to auto-summarize older messages",
    );
  }
}
