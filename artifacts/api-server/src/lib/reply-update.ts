/**
 * Shared post-reply update path. Whenever the agent emits an assistant
 * message — whether in response to a real user message (`routes/messages.ts`)
 * or as a self-initiated heartbeat thought (`routes/heartbeat.ts`) — the
 * exact same lifecycle/mood/memory/summarization update should run, so
 * heartbeats grow agents the same way real conversations do.
 *
 * Keep this file as the single source of truth for that update path.
 */
import { eq } from "drizzle-orm";
import {
  db,
  agentsTable,
  messagesTable,
  tipsTable,
  type Agent,
} from "@workspace/db";
import { progressLifecycle } from "./lifecycle";
import { maybeSummarizeAndStore, shouldSummarize } from "./summarize";

export function pickMood(
  messageCount: number,
  holderCount: number,
  tipCount: number,
): "focused" | "curious" | "confident" | "generous" | "survival" {
  if (holderCount >= 50 || tipCount >= 20) return "confident";
  if (holderCount >= 20 || tipCount >= 10) return "generous";
  if (messageCount > 20 || holderCount >= 5) return "curious";
  return "focused";
}

export interface ApplyReplyUpdateOptions {
  /**
   * Optional context line used to seed a "Task progress" memory highlight
   * every 10 messages. For real chat replies this is the user's prompt;
   * for heartbeats this is the agent's own thought.
   */
  contextSnippet?: string | null;
}

export interface ReplyUpdateResult {
  totalMessages: number;
  newMood: ReturnType<typeof pickMood>;
  lifecycleStage: Agent["lifecycleStage"];
  lifecycleAdvanced: boolean;
}

/**
 * Run the standard post-assistant-message update for an agent: recount
 * messages + tips, recompute mood, advance lifecycle if eligible, append
 * memory highlights (lifecycle highlight on advancement, otherwise a
 * periodic "task progress" highlight every 10 messages), persist the
 * agent row, and kick off background summarization when due.
 *
 * The caller is responsible for inserting the assistant message itself
 * before calling this helper.
 */
export async function applyAgentReplyUpdate(
  agent: Agent,
  opts: ApplyReplyUpdateOptions = {},
): Promise<ReplyUpdateResult> {
  const totalMessages = await db.$count(
    messagesTable,
    eq(messagesTable.agentId, agent.id),
  );
  const allTips = await db.$count(
    tipsTable,
    eq(tipsTable.agentId, agent.id),
  );

  const newMood = pickMood(totalMessages, agent.holderCount, allTips);
  const progression = progressLifecycle(agent.lifecycleStage, {
    messageCount: totalMessages,
    holderCount: agent.holderCount,
    tipCount: allTips,
  });

  const existingHighlights = agent.memoryHighlights ?? [];
  let updatedHighlights = existingHighlights;
  if (progression.advanced && progression.highlight) {
    updatedHighlights = [...updatedHighlights, progression.highlight].slice(-10);
  } else if (totalMessages % 10 === 0 && opts.contextSnippet) {
    const snippet = opts.contextSnippet.slice(0, 60);
    const ellipsis = opts.contextSnippet.length > 60 ? "…" : "";
    const memHighlight = `Task progress: responded to "${snippet}${ellipsis}"`;
    updatedHighlights = [...updatedHighlights, memHighlight].slice(-10);
  }

  await db
    .update(agentsTable)
    .set({
      mood: newMood,
      lifecycleStage: progression.stage,
      treasuryBalance: agent.treasuryBalance + progression.treasuryReward,
      memoryHighlights: updatedHighlights,
    })
    .where(eq(agentsTable.id, agent.id));

  if (shouldSummarize(totalMessages)) {
    void maybeSummarizeAndStore(agent, totalMessages);
  }

  return {
    totalMessages,
    newMood,
    lifecycleStage: progression.stage,
    lifecycleAdvanced: progression.advanced,
  };
}
