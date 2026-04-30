import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import messagesRouter from "./messages";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(messagesRouter);
router.use(communityRouter);

export default router;
