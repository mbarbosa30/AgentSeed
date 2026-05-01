import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import messagesRouter from "./messages";
import communityRouter from "./community";
import heartbeatRouter from "./heartbeat";
import affiliateRouter from "./affiliate";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
// Heartbeat must be mounted *before* `agentsRouter` so the static path
// `/agents/heartbeat-candidates` doesn't get swallowed by the
// `/agents/:slug` parameterized route.
router.use(heartbeatRouter);
// Affiliate routes (e.g. `/agents/:slug/travel-stats`) likewise need to
// land before the `/agents/:slug` parameterized routes.
router.use(affiliateRouter);
// Admin routes (`/admin/*`) need their own static prefix and must mount
// before the catch-all `agentsRouter`.
router.use(adminRouter);
router.use(agentsRouter);
router.use(messagesRouter);
router.use(communityRouter);

export default router;
