import type { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "./logger";

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * Lightweight in-memory token-bucket rate limiter keyed by client IP.
 * Suitable for single-instance demo workloads. For multi-instance prod we
 * would back this with Redis, but for the Agents Day demo this is enough
 * to stop a click-loop or naive bot from draining the on-chain platform
 * wallet via the tip endpoint.
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  name: string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();

  // Periodic GC so the map doesn't grow forever.
  const gc = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(opts.windowMs, 60_000));
  if (typeof gc.unref === "function") gc.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();
    const key = `${opts.name}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    if (bucket.count >= opts.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfter.toString());
      logger.warn(
        { ip, name: opts.name, retryAfter },
        "rate limit exceeded",
      );
      res.status(429).json({
        error: "Too many requests, slow down a bit.",
        retryAfter,
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}
