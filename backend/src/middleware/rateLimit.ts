import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory rate limiter (demo/academic).
 * Not distributed — sufficient to demonstrate brute-force mitigation on /auth.
 */
export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  const { windowMs, max, keyPrefix } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      const retrySec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retrySec));
      return res.status(429).json({
        message: `Trop de tentatives. Réessayez dans ${retrySec}s.`
      });
    }
    return next();
  };
}

/** Test helper — clear buckets between unit tests if needed. */
export function _resetRateLimitBucketsForTests() {
  buckets.clear();
}
