import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import messagesRouter from "./messages";
import communityRouter from "./community";
import heartbeatRouter from "./heartbeat";

const router: IRouter = Router();

router.use(healthRouter);
// Heartbeat must be mounted *before* `agentsRouter` so the static path
// `/agents/heartbeat-candidates` doesn't get swallowed by the
// `/agents/:slug` parameterized route.
router.use(heartbeatRouter);
router.use(agentsRouter);
router.use(messagesRouter);
router.use(communityRouter);

export default router;
