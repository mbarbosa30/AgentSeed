import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  tipsTable,
  agentsTable,
  messagesTable,
  platformIncidentsTable,
} from "@workspace/db";
import {
  isAutosettleEnabled,
  isTerminalAcpStatus,
  tryAdvanceTipJob,
  type AcpJobStatus,
} from "./acp";
import { logger } from "./logger";
import {
  isPagerDutyConfigured,
  resolveIncident,
  triggerIncident,
} from "./pagerduty";

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
let pagerTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

const HEARTBEAT_DEDUP_KEY = "heartbeat-worker-stale";
const HEARTBEAT_KIND = "heartbeat-stale";

const RAW_ACP_STUCK = Number(process.env.PAGERDUTY_ACP_STUCK_MS ?? 30 * 60_000);
const ACP_STUCK_MS =
  Number.isFinite(RAW_ACP_STUCK) && RAW_ACP_STUCK >= 60_000
    ? RAW_ACP_STUCK
    : 30 * 60_000;

const RAW_HB_STALE = Number(
  process.env.PAGERDUTY_HEARTBEAT_STALE_MS ?? 60 * 60_000,
);
const HEARTBEAT_STALE_MS =
  Number.isFinite(RAW_HB_STALE) && RAW_HB_STALE >= 5 * 60_000
    ? RAW_HB_STALE
    : 60 * 60_000;

const RAW_HB_CHECK = Number(
  process.env.PAGERDUTY_HEARTBEAT_CHECK_MS ?? 5 * 60_000,
);
const HEARTBEAT_CHECK_MS =
  Number.isFinite(RAW_HB_CHECK) && RAW_HB_CHECK >= 30_000
    ? RAW_HB_CHECK
    : 5 * 60_000;

const PAGER_CHECK_MS = Math.max(POLL_INTERVAL_MS, 30_000);

function appOrigin(): string {
  return (
    process.env.PUBLIC_APP_ORIGIN?.replace(/\/+$/, "") ??
    process.env.AGENTSEED_PUBLIC_ORIGIN?.replace(/\/+$/, "") ??
    ""
  );
}

function agentLink(slug: string | null): { href: string; text: string }[] {
  const origin = appOrigin();
  if (!origin || !slug) return [];
  return [{ href: `${origin}/agent/${slug}`, text: `AgentSeed: ${slug}` }];
}

const FAILURE_STATUSES: AcpJobStatus[] = ["failed", "rejected", "expired"];

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

// Look for ACP tip jobs that should generate a PagerDuty incident:
//  (a) terminal-failure status (failed/rejected/expired) without an
//      existing pd_incident_id, or
//  (b) non-terminal status that has been pending past ACP_STUCK_MS.
// Also resolve incidents for tips that previously paged but have since
// completed.
async function pagerTipScan(): Promise<void> {
  if (!isPagerDutyConfigured()) return;
  try {
    const cutoff = new Date(Date.now() - ACP_STUCK_MS);

    const failureRows = await db
      .select({
        tipId: tipsTable.id,
        jobId: tipsTable.acpJobId,
        status: tipsTable.acpJobStatus,
        amount: tipsTable.amount,
        slug: agentsTable.slug,
        agentName: agentsTable.name,
      })
      .from(tipsTable)
      .innerJoin(agentsTable, eq(agentsTable.id, tipsTable.agentId))
      .where(
        and(
          isNotNull(tipsTable.acpJobId),
          isNull(tipsTable.pdIncidentId),
          or(
            inArray(tipsTable.acpJobStatus, FAILURE_STATUSES),
            and(
              notInArray(tipsTable.acpJobStatus, TERMINAL_STATUSES),
              or(
                lt(tipsTable.acpUpdatedAt, cutoff),
                and(
                  sql`${tipsTable.acpUpdatedAt} IS NULL`,
                  lt(tipsTable.createdAt, cutoff),
                ),
              ),
            ),
          ),
        ),
      )
      .limit(20);

    for (const row of failureRows) {
      const isTerminal = (FAILURE_STATUSES as string[]).includes(row.status);
      const summary = isTerminal
        ? `ACP tip ${row.tipId} for ${row.agentName} terminally failed (${row.status})`
        : `ACP tip ${row.tipId} for ${row.agentName} stuck in ${row.status} > ${Math.round(ACP_STUCK_MS / 60_000)}m`;
      const dedupKey = `acp-tip-${row.tipId}`;
      const result = await triggerIncident({
        dedupKey,
        summary,
        source: `agentseed/agent/${row.slug}`,
        severity: isTerminal ? "error" : "warning",
        customDetails: {
          tipId: row.tipId,
          acpJobId: row.jobId,
          acpStatus: row.status,
          amount: row.amount,
          agentSlug: row.slug,
          agentName: row.agentName,
          stuckThresholdMs: ACP_STUCK_MS,
        },
        links: agentLink(row.slug),
      });
      // Only mark the tip "paged" after PagerDuty confirmed the
      // event was accepted — otherwise a transient outage would
      // permanently suppress retries. Persist the dedup key (events API
      // doesn't return an incident id; admin route resolves it via REST
      // when needed).
      if (result?.status === "success") {
        const incidentRef = result.dedup_key ?? dedupKey;
        await db
          .update(tipsTable)
          .set({ pdIncidentId: incidentRef })
          .where(eq(tipsTable.id, row.tipId));
        logger.info(
          { tipId: row.tipId, status: row.status, dedupKey },
          "PagerDuty: ACP tip incident triggered",
        );
      } else {
        logger.warn(
          { tipId: row.tipId, status: row.status, dedupKey },
          "PagerDuty: ACP tip trigger failed — will retry on next scan",
        );
      }
    }

    // Auto-resolve incidents for tips that have since completed. We
    // *retain* `pd_incident_id` (so admin page still lists the incident
    // in its "recently resolved" view) and gate the local-state update
    // on a confirmed PagerDuty resolve so a transient outage doesn't
    // leave the incident open forever in PagerDuty.
    const resolvableRows = await db
      .select({
        tipId: tipsTable.id,
        pdId: tipsTable.pdIncidentId,
      })
      .from(tipsTable)
      .where(
        and(
          isNotNull(tipsTable.pdIncidentId),
          isNull(tipsTable.pdResolvedAt),
          eq(tipsTable.acpJobStatus, "completed"),
        ),
      )
      .limit(20);

    for (const row of resolvableRows) {
      const dedupKey = `acp-tip-${row.tipId}`;
      const result = await resolveIncident(dedupKey);
      if (result?.status === "success") {
        await db
          .update(tipsTable)
          .set({ pdResolvedAt: new Date() })
          .where(eq(tipsTable.id, row.tipId));
        logger.info(
          { tipId: row.tipId, pdId: row.pdId },
          "PagerDuty: ACP tip incident resolved",
        );
      } else {
        logger.warn(
          { tipId: row.tipId, pdId: row.pdId },
          "PagerDuty: ACP tip resolve failed — will retry on next scan",
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "PagerDuty: pagerTipScan error");
  }
}

// Singleton "heartbeat-worker-stale" incident check. Trigger when the
// most recent isHeartbeat=true message is older than HEARTBEAT_STALE_MS
// (or when no heartbeat has ever landed but the worker is configured),
// auto-resolve when ticks resume.
async function heartbeatStaleCheck(): Promise<void> {
  if (!isPagerDutyConfigured()) return;
  // Only meaningful if the heartbeat shared secret is configured — i.e.
  // the worker is wired. Otherwise we'd permanently page on every fresh
  // dev clone.
  if (!process.env.HEARTBEAT_SHARED_SECRET) return;

  try {
    const [row] = await db
      .select({ lastAt: sql<Date | null>`max(${messagesTable.createdAt})` })
      .from(messagesTable)
      .where(eq(messagesTable.isHeartbeat, true));

    const lastAt = row?.lastAt ? new Date(row.lastAt) : null;
    const stale =
      lastAt === null || Date.now() - lastAt.getTime() > HEARTBEAT_STALE_MS;

    const [existing] = await db
      .select()
      .from(platformIncidentsTable)
      .where(eq(platformIncidentsTable.dedupKey, HEARTBEAT_DEDUP_KEY))
      .limit(1);

    if (stale && (!existing || existing.status !== "open")) {
      const summary = lastAt
        ? `AgentSeed heartbeat worker silent for ${Math.round((Date.now() - lastAt.getTime()) / 60_000)}m`
        : `AgentSeed heartbeat worker has never produced a tick`;
      const result = await triggerIncident({
        dedupKey: HEARTBEAT_DEDUP_KEY,
        summary,
        source: "agentseed/heartbeat-worker",
        severity: "warning",
        customDetails: {
          lastHeartbeatAt: lastAt ? lastAt.toISOString() : null,
          staleThresholdMs: HEARTBEAT_STALE_MS,
        },
      });
      // Only persist the local incident row after PagerDuty confirms
      // the event — a failed trigger should re-arm next tick.
      if (result?.status === "success") {
        const incidentRef = result.dedup_key ?? HEARTBEAT_DEDUP_KEY;
        if (existing) {
          await db
            .update(platformIncidentsTable)
            .set({
              status: "open",
              summary,
              pdIncidentId: incidentRef,
              resolvedAt: null,
              openedAt: new Date(),
            })
            .where(eq(platformIncidentsTable.id, existing.id));
        } else {
          await db.insert(platformIncidentsTable).values({
            kind: HEARTBEAT_KIND,
            dedupKey: HEARTBEAT_DEDUP_KEY,
            pdIncidentId: incidentRef,
            status: "open",
            summary,
          });
        }
        logger.info(
          { lastAt, staleMs: HEARTBEAT_STALE_MS },
          "PagerDuty: heartbeat-stale incident triggered",
        );
      } else {
        logger.warn(
          { lastAt },
          "PagerDuty: heartbeat-stale trigger failed — will retry on next check",
        );
      }
    } else if (!stale && existing && existing.status === "open") {
      const result = await resolveIncident(HEARTBEAT_DEDUP_KEY);
      if (result?.status === "success") {
        await db
          .update(platformIncidentsTable)
          .set({ status: "resolved", resolvedAt: new Date() })
          .where(eq(platformIncidentsTable.id, existing.id));
        logger.info("PagerDuty: heartbeat-stale incident resolved");
      } else {
        logger.warn(
          "PagerDuty: heartbeat-stale resolve failed — will retry on next check",
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "PagerDuty: heartbeatStaleCheck error");
  }
}

export function startSettlementWorker(): void {
  if (!timer) {
    if (isAutosettleEnabled()) {
      logger.info({ pollMs: POLL_INTERVAL_MS }, "ACP settlement worker started");
      timer = setInterval(tick, POLL_INTERVAL_MS);
      void tick();
    } else {
      logger.info(
        "ACP settlement worker not started (set VIRTUALS_AUTOSETTLE_ENABLED=true and provider creds to enable)",
      );
    }
  }

  if (isPagerDutyConfigured()) {
    if (!pagerTimer) {
      logger.info(
        { pollMs: PAGER_CHECK_MS, stuckMs: ACP_STUCK_MS },
        "PagerDuty: ACP tip incident scanner started",
      );
      pagerTimer = setInterval(pagerTipScan, PAGER_CHECK_MS);
      const p = pagerTimer;
      if (typeof p.unref === "function") p.unref();
      void pagerTipScan();
    }
    if (!heartbeatTimer && process.env.HEARTBEAT_SHARED_SECRET) {
      logger.info(
        { pollMs: HEARTBEAT_CHECK_MS, staleMs: HEARTBEAT_STALE_MS },
        "PagerDuty: heartbeat-stale checker started",
      );
      heartbeatTimer = setInterval(heartbeatStaleCheck, HEARTBEAT_CHECK_MS);
      const h = heartbeatTimer;
      if (typeof h.unref === "function") h.unref();
      void heartbeatStaleCheck();
    }
  } else {
    logger.info(
      "PagerDuty: integration disabled (PAGERDUTY_ROUTING_KEY unset)",
    );
  }
}

export function stopSettlementWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (pagerTimer) {
    clearInterval(pagerTimer);
    pagerTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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
