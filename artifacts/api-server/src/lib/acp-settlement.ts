import { and, eq, isNotNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db, tipsTable, agentsTable } from "@workspace/db";
import {
  isAutosettleEnabled,
  isTerminalAcpStatus,
  tryAdvanceTipJob,
  type AcpJobStatus,
} from "./acp";
import { logger } from "./logger";

// Clamp the poll interval so a misconfigured `VIRTUALS_SETTLEMENT_POLL_MS`
// (e.g. `0`, negative, or NaN) cannot turn the worker into a hot loop that
// pummels the DB and the on-chain RPC. Floor at 1 s, ceiling at 5 min.
const RAW_POLL = Number(process.env.VIRTUALS_SETTLEMENT_POLL_MS ?? 15_000);
const POLL_INTERVAL_MS =
  Number.isFinite(RAW_POLL) && RAW_POLL >= 1_000
    ? Math.min(RAW_POLL, 5 * 60_000)
    : 15_000;
const TERMINAL_STATUSES: AcpJobStatus[] = [
  "completed",
  "rejected",
  "expired",
  "failed",
];

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Pick up to N pending tip jobs that need a settlement step. */
async function pendingTipJobs(limit = 5) {
  return db
    .select({
      tipId: tipsTable.id,
      jobId: tipsTable.acpJobId,
      status: tipsTable.acpJobStatus,
      amount: tipsTable.amount,
      walletAddress: agentsTable.virtualsWalletAddress,
    })
    .from(tipsTable)
    .innerJoin(agentsTable, eq(agentsTable.id, tipsTable.agentId))
    .where(
      and(
        isNotNull(tipsTable.acpJobId),
        notInArray(tipsTable.acpJobStatus, TERMINAL_STATUSES),
      ),
    )
    .limit(limit);
}

async function persistStatus(tipId: number, status: AcpJobStatus) {
  await db
    .update(tipsTable)
    .set({ acpJobStatus: status, acpUpdatedAt: new Date() })
    .where(eq(tipsTable.id, tipId));
}

/** Drive a single tip through one settlement step. */
export async function kickSettlement(tipId: number): Promise<void> {
  if (!isAutosettleEnabled()) return;
  const [row] = await db
    .select({
      jobId: tipsTable.acpJobId,
      status: tipsTable.acpJobStatus,
      amount: tipsTable.amount,
      walletAddress: agentsTable.virtualsWalletAddress,
    })
    .from(tipsTable)
    .innerJoin(agentsTable, eq(agentsTable.id, tipsTable.agentId))
    .where(eq(tipsTable.id, tipId))
    .limit(1);
  if (!row || !row.jobId) return;
  const next = await tryAdvanceTipJob({
    jobId: row.jobId,
    currentStatus: row.status as AcpJobStatus,
    agentWalletAddress: row.walletAddress,
    amount: row.amount,
  });
  if (next) {
    await persistStatus(tipId, next);
    logger.info({ tipId, jobId: row.jobId, status: next }, "ACP: tip advanced");
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    if (!isAutosettleEnabled()) return;
    const rows = await pendingTipJobs();
    for (const row of rows) {
      if (!row.jobId) continue;
      const next = await tryAdvanceTipJob({
        jobId: row.jobId,
        currentStatus: row.status as AcpJobStatus,
        agentWalletAddress: row.walletAddress,
        amount: row.amount,
      });
      if (next && next !== row.status) {
        await persistStatus(row.tipId, next);
        logger.info(
          { tipId: row.tipId, jobId: row.jobId, status: next },
          "ACP: tip advanced (poller)",
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "ACP settlement poller error");
  } finally {
    running = false;
  }
}

export function startSettlementWorker(): void {
  if (timer) return;
  if (!isAutosettleEnabled()) {
    logger.info(
      "ACP settlement worker not started (set VIRTUALS_AUTOSETTLE_ENABLED=true and provider creds to enable)",
    );
    return;
  }
  logger.info({ pollMs: POLL_INTERVAL_MS }, "ACP settlement worker started");
  timer = setInterval(tick, POLL_INTERVAL_MS);
  // Kick once on startup.
  void tick();
}

export function stopSettlementWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Mark long-stuck (>1h) non-terminal tip jobs as `expired` so the UI stops
 * spinning. Used by the manual cleanup script.
 */
export async function markStuckJobsExpired(maxAgeMs = 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await db
    .update(tipsTable)
    .set({ acpJobStatus: "expired", acpUpdatedAt: new Date() })
    .where(
      and(
        isNotNull(tipsTable.acpJobId),
        notInArray(tipsTable.acpJobStatus, TERMINAL_STATUSES),
        or(
          lt(tipsTable.acpUpdatedAt, cutoff),
          and(sql`${tipsTable.acpUpdatedAt} IS NULL`, lt(tipsTable.createdAt, cutoff)),
        ),
      ),
    )
    .returning({ id: tipsTable.id });
  return result.length;
}

export { isTerminalAcpStatus };
