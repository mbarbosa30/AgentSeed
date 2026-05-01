/**
 * Local entrypoint: `pnpm --filter @workspace/heartbeat-worker heartbeat:once`.
 *
 * Reads the same env vars as the worker out of `process.env` and runs a
 * single tick. Useful for smoke-testing locally before `wrangler deploy`,
 * and for triggering thoughts on demand during dev.
 */
import { runTick, type Env } from "./run-tick";

function envFromProcess(): Env {
  const e = process.env;
  return {
    GEMINI_API_KEY: e.GEMINI_API_KEY ?? "",
    CF_AI_GATEWAY_URL: e.CF_AI_GATEWAY_URL ?? "",
    AGENTSEED_API_BASE: e.AGENTSEED_API_BASE ?? "",
    HEARTBEAT_SHARED_SECRET: e.HEARTBEAT_SHARED_SECRET ?? "",
    HEARTBEAT_CANDIDATE_LIMIT: e.HEARTBEAT_CANDIDATE_LIMIT,
    HEARTBEAT_MIN_IDLE_MINUTES: e.HEARTBEAT_MIN_IDLE_MINUTES,
  };
}

async function main(): Promise<void> {
  const env = envFromProcess();
  const result = await runTick(env);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
