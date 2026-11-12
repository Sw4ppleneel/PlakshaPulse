import "server-only";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

/**
 * Per-user burst limits. Single-node in-memory store: correct for one app server.
 * If you scale out, swap these for RateLimiterPostgres / RateLimiterRedis with the same keys.
 * Long-window quotas (issues per day) are enforced against the database in the actions themselves.
 */
const limiters = {
  createIssue: new RateLimiterMemory({ keyPrefix: "issue", points: 5, duration: 60 * 10 }),
  vote: new RateLimiterMemory({ keyPrefix: "vote", points: 40, duration: 60 }),
  comment: new RateLimiterMemory({ keyPrefix: "comment", points: 10, duration: 60 }),
  flag: new RateLimiterMemory({ keyPrefix: "flag", points: 10, duration: 60 * 10 }),
  search: new RateLimiterMemory({ keyPrefix: "search", points: 60, duration: 60 }),
  read: new RateLimiterMemory({ keyPrefix: "read", points: 240, duration: 60 }),
  admin: new RateLimiterMemory({ keyPrefix: "admin", points: 120, duration: 60 }),
};

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Slow down — try again in ${retryAfter}s.`);
  }
}

export async function limit(kind: keyof typeof limiters, key: string) {
  try {
    await limiters[kind].consume(key);
  } catch (e) {
    if (e instanceof RateLimiterRes) throw new RateLimitError(Math.ceil(e.msBeforeNext / 1000));
    throw e;
  }
}
