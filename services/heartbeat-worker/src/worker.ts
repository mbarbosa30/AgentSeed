/**
 * Cloudflare Worker entrypoint. The cron trigger configured in
 * `wrangler.toml` fires `scheduled()` on a schedule; we call into the
 * shared `runTick` so the same logic is reachable from `pnpm heartbeat:once`.
 */
import { runTick, type Env } from "./run-tick";

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runTick(env)
        .then((result) => {
          console.log("heartbeat tick", JSON.stringify(result));
        })
        .catch((err) => {
          console.error("heartbeat tick failed", err);
        }),
    );
  },

  // A tiny GET handler so you can hit the worker's URL once it's deployed
  // and confirm it's alive without waiting 15 minutes for the cron.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/run" && req.method === "POST") {
      const provided = req.headers.get("x-heartbeat-secret");
      if (!env.HEARTBEAT_SHARED_SECRET || provided !== env.HEARTBEAT_SHARED_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      try {
        const result = await runTick(env);
        return Response.json(result);
      } catch (err) {
        return new Response(
          err instanceof Error ? err.message : String(err),
          { status: 500 },
        );
      }
    }
    return new Response("agentseed heartbeat worker — POST /run to fire a tick", {
      status: 200,
    });
  },
};
