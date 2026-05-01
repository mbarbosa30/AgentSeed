/**
 * Manual cleanup for stuck ACP tip jobs.
 *
 * Walks the `tips` table and marks any non-terminal ACP jobs older than the
 * cutoff as `expired` so the UI stops showing in-flight badges. Safe to run
 * repeatedly. Does NOT touch in-app tips that never had an `acp_job_id`.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server exec tsx scripts/acp-cleanup.ts
 *   ACP_STUCK_HOURS=2 pnpm --filter @workspace/api-server exec tsx scripts/acp-cleanup.ts
 */
import { markStuckJobsExpired } from "../src/lib/acp-settlement";

async function main() {
  const hours = Number(process.env.ACP_STUCK_HOURS ?? 1);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("ACP_STUCK_HOURS must be a positive number");
    process.exit(1);
  }
  const expired = await markStuckJobsExpired(hours * 60 * 60 * 1000);
  console.log(`Marked ${expired} stuck ACP tip job(s) as expired (cutoff: ${hours}h).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("acp-cleanup failed:", err);
  process.exit(1);
});
