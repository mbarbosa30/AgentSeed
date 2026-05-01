import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { desc, isNotNull } from "drizzle-orm";
import {
  db,
  tipsTable,
  agentsTable,
  platformIncidentsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  fetchIncidentSummary,
  findIncidentIdByDedupKey,
  isPagerDutyConfigured,
  isPagerDutyRestConfigured,
  type PagerDutyIncidentSummary,
} from "../lib/pagerduty";

const router: IRouter = Router();

const ADMIN_HEADER = "x-admin-secret";

// Mirror heartbeat.ts: fail closed when the shared secret is missing so a
// misconfigured deployment can't accidentally expose triage data.
function requireAdminSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.ADMIN_SHARED_SECRET;
  if (!expected) {
    res
      .status(503)
      .json({ error: "Admin endpoint disabled (ADMIN_SHARED_SECRET unset)" });
    return;
  }
  const provided = req.header(ADMIN_HEADER);
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Invalid or missing admin secret" });
    return;
  }
  next();
}

type AdminIncidentRow = {
  source: "acp-tip" | "platform";
  kind: string;
  dedupKey: string;
  pdIncidentId: string | null;
  status: string;
  summary: string | null;
  openedAt: string | null;
  resolvedAt: string | null;
  context: Record<string, unknown>;
  pagerDuty: PagerDutyIncidentSummary | null;
};

router.get(
  "/admin/incidents",
  requireAdminSecret,
  async (_req: Request, res: Response) => {
    const tipRows = await db
      .select({
        tipId: tipsTable.id,
        agentSlug: agentsTable.slug,
        agentName: agentsTable.name,
        amount: tipsTable.amount,
        acpJobId: tipsTable.acpJobId,
        acpStatus: tipsTable.acpJobStatus,
        acpUpdatedAt: tipsTable.acpUpdatedAt,
        createdAt: tipsTable.createdAt,
        pdIncidentId: tipsTable.pdIncidentId,
        pdResolvedAt: tipsTable.pdResolvedAt,
      })
      .from(tipsTable)
      .innerJoin(agentsTable, eq(agentsTable.id, tipsTable.agentId))
      .where(isNotNull(tipsTable.pdIncidentId))
      .orderBy(desc(tipsTable.createdAt))
      .limit(50);

    const platformRows = await db
      .select()
      .from(platformIncidentsTable)
      .orderBy(desc(platformIncidentsTable.openedAt))
      .limit(50);

    const incidents: AdminIncidentRow[] = [];

    for (const r of tipRows) {
      const localStatus = r.pdResolvedAt ? "resolved" : r.acpStatus;
      incidents.push({
        source: "acp-tip",
        kind: "acp-tip-failure",
        dedupKey: `acp-tip-${r.tipId}`,
        pdIncidentId: r.pdIncidentId,
        status: localStatus,
        summary: `Tip ${r.tipId} for ${r.agentName} (${r.acpStatus})`,
        openedAt: (r.acpUpdatedAt ?? r.createdAt)?.toISOString() ?? null,
        resolvedAt: r.pdResolvedAt?.toISOString() ?? null,
        context: {
          tipId: r.tipId,
          agentSlug: r.agentSlug,
          agentName: r.agentName,
          amount: r.amount,
          acpJobId: r.acpJobId,
          acpStatus: r.acpStatus,
        },
        pagerDuty: null,
      });
    }
    for (const r of platformRows) {
      incidents.push({
        source: "platform",
        kind: r.kind,
        dedupKey: r.dedupKey,
        pdIncidentId: r.pdIncidentId,
        status: r.status,
        summary: r.summary,
        openedAt: r.openedAt?.toISOString() ?? null,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        context: {},
        pagerDuty: null,
      });
    }

    // Fetch PagerDuty triage notes in parallel. The events API only
    // returns a dedup_key (which we persisted as `pdIncidentId`), so for
    // each incident we first resolve dedup_key -> real PagerDuty
    // incident id via REST search, then fetch the incident + its notes.
    // Both calls are no-ops when PAGERDUTY_API_TOKEN is missing — admin
    // page degrades to local row only.
    if (isPagerDutyRestConfigured()) {
      await Promise.all(
        incidents.map(async (inc) => {
          if (!inc.pdIncidentId) return;
          // If we ever store a real PagerDuty incident id (id format
          // looks like P + alnum) we use it directly; otherwise treat
          // the value as a dedup key and look it up.
          const looksLikeIncidentId = /^P[A-Z0-9]{6,}$/.test(inc.pdIncidentId);
          const incidentId = looksLikeIncidentId
            ? inc.pdIncidentId
            : await findIncidentIdByDedupKey(inc.pdIncidentId);
          if (!incidentId) return;
          inc.pagerDuty = await fetchIncidentSummary(incidentId);
        }),
      );
    }

    res.json({
      pagerDutyConfigured: isPagerDutyConfigured(),
      pagerDutyRestConfigured: isPagerDutyRestConfigured(),
      incidents,
    });
  },
);

export default router;
