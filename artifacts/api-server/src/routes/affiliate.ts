// Affiliate click attribution + 302 redirect for Viator activity cards.
import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  agentsTable,
  affiliateClicksTable,
  tipsTable,
  messagesTable,
} from "@workspace/db";
import { buildAffiliateUrl } from "../lib/viator";
import { progressLifecycle } from "../lib/lifecycle";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

// Per-IP cap on click-redirects so a click bot can't spam attribution
// rows or treasury rewards.
const clickRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  name: "affiliate-click",
});

const TREASURY_REWARD_PER_CLICK = 0.5;
const COMMISSION_RATE = Number(process.env.VIATOR_COMMISSION_RATE ?? "0.08");
const FALLBACK_VIATOR_HOME = "https://www.viator.com";

const ALLOWED_REDIRECT_HOST_SUFFIXES = (
  process.env.AFFILIATE_REDIRECT_ALLOWLIST ?? "viator.com,tripadvisor.com"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedRedirect(rawUrl: string): URL | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase();
    const ok = ALLOWED_REDIRECT_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    return ok ? u : null;
  } catch {
    return null;
  }
}

router.get("/affiliate/click/:slug/:productCode", clickRateLimiter, async (req, res) => {
  const slug = String(req.params.slug ?? "");
  const productCode = String(req.params.productCode ?? "");
  const rawUrl = typeof req.query.u === "string" ? req.query.u : "";
  const userHandle = typeof req.query.h === "string" ? req.query.h.slice(0, 64) : null;
  const productTitle = typeof req.query.t === "string" ? req.query.t.slice(0, 200) : null;
  const priceRaw = typeof req.query.p === "string" ? Number(req.query.p) : NaN;
  const price =
    Number.isFinite(priceRaw) && priceRaw > 0 && priceRaw <= 10_000
      ? priceRaw
      : null;
  const currency = typeof req.query.c === "string" ? req.query.c.slice(0, 8) : null;

  if (!slug || !productCode) {
    res.status(400).json({ error: "Missing slug or productCode" });
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  if (!agent.isTravelConcierge) {
    res.status(403).json({ error: "Agent is not a travel concierge" });
    return;
  }

  const validatedUrl = rawUrl ? isAllowedRedirect(rawUrl) : null;
  const fallback = isAllowedRedirect(
    `https://www.viator.com/tours/${encodeURIComponent(productCode)}`,
  );
  const target = validatedUrl ?? fallback;
  if (!target) {
    res.status(400).json({ error: "Missing or disallowed redirect target" });
    return;
  }

  const finalUrl = buildAffiliateUrl(target.toString(), agent.viatorPartnerId);
  const estCommission = price != null ? Number((price * COMMISSION_RATE).toFixed(2)) : null;

  try {
    await db.insert(affiliateClicksTable).values({
      agentId: agent.id,
      productCode,
      productTitle,
      userHandle,
      price,
      currency,
      estCommission,
      destinationUrl: finalUrl,
    });

    // Small treasury nudge + lifecycle bump. Click weight is intentionally
    // far below a tip's weight so a click farm can't out-earn real
    // supporters; lifecycle scoring already counts clicks via `tipCount`.
    const totalMessages = await db.$count(messagesTable, eq(messagesTable.agentId, agent.id));
    const totalTips = await db.$count(tipsTable, eq(tipsTable.agentId, agent.id));
    const totalClicks = await db.$count(
      affiliateClicksTable,
      eq(affiliateClicksTable.agentId, agent.id),
    );
    const progression = progressLifecycle(agent.lifecycleStage, {
      messageCount: totalMessages,
      holderCount: agent.holderCount,
      tipCount: totalTips,
      clickCount: totalClicks,
    });

    const existingHighlights = agent.memoryHighlights ?? [];
    const updatedHighlights =
      progression.advanced && progression.highlight
        ? [...existingHighlights, progression.highlight].slice(-10)
        : existingHighlights;

    await db
      .update(agentsTable)
      .set({
        treasuryBalance: sql`${agentsTable.treasuryBalance} + ${TREASURY_REWARD_PER_CLICK + progression.treasuryReward}`,
        lifecycleStage: progression.stage,
        memoryHighlights: updatedHighlights,
      })
      .where(eq(agentsTable.id, agent.id));
  } catch (err) {
    // We must not fail the user's click-out flow even if the bookkeeping
    // hiccups; the partner attribution still works because `pid` is in
    // the URL we redirect to. Log and move on.
    logger.error({ err, slug, productCode }, "affiliate: click logging failed");
  }

  res.redirect(302, finalUrl || FALLBACK_VIATOR_HOME);
});

router.get("/agents/:slug/travel-stats", async (req, res) => {
  const slug = String(req.params.slug ?? "");
  const [agent] = await db
    .select({
      id: agentsTable.id,
      isTravelConcierge: agentsTable.isTravelConcierge,
      viatorPartnerId: agentsTable.viatorPartnerId,
    })
    .from(agentsTable)
    .where(eq(agentsTable.slug, slug))
    .limit(1);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  if (!agent.isTravelConcierge) {
    res.json({
      isTravelConcierge: false,
      hasPartnerId: false,
      activitiesSurfaced: 0,
      clickOuts: 0,
      estCommission: 0,
      currency: "USD",
      recent: [],
    });
    return;
  }

  const totalRow = await db
    .select({
      clicks: sql<number>`coalesce(count(*), 0)`,
      sumCommission: sql<number>`coalesce(sum(${affiliateClicksTable.estCommission}), 0)`,
    })
    .from(affiliateClicksTable)
    .where(eq(affiliateClicksTable.agentId, agent.id));

  const totals = totalRow[0] ?? { clicks: 0, sumCommission: 0 };
  const clickOuts = Number(totals.clicks) || 0;
  const estCommission = Math.round(Number(totals.sumCommission) * 100) / 100;

  const [currencyRow] = await db
    .select({ currency: affiliateClicksTable.currency })
    .from(affiliateClicksTable)
    .where(eq(affiliateClicksTable.agentId, agent.id))
    .orderBy(desc(affiliateClicksTable.createdAt))
    .limit(1);

  const recent = await db
    .select({
      id: affiliateClicksTable.id,
      productCode: affiliateClicksTable.productCode,
      productTitle: affiliateClicksTable.productTitle,
      price: affiliateClicksTable.price,
      currency: affiliateClicksTable.currency,
      createdAt: affiliateClicksTable.createdAt,
    })
    .from(affiliateClicksTable)
    .where(eq(affiliateClicksTable.agentId, agent.id))
    .orderBy(desc(affiliateClicksTable.createdAt))
    .limit(10);

  // `activitiesSurfaced` is a coarse proxy: each click implies the
  // model surfaced at least the activity that was clicked. We don't yet
  // record impressions separately to avoid bloating the DB; this is
  // honest about what we measure.
  res.json({
    isTravelConcierge: true,
    hasPartnerId: Boolean(agent.viatorPartnerId),
    activitiesSurfaced: clickOuts,
    clickOuts,
    estCommission,
    currency: currencyRow?.currency ?? "USD",
    recent: recent.map((r) => ({
      id: r.id,
      productCode: r.productCode,
      productTitle: r.productTitle,
      price: r.price,
      currency: r.currency,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

export default router;
