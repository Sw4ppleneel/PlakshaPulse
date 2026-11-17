import "server-only";
import { sql } from "drizzle-orm";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { db } from "@/db";

/**
 * Anti-spam limits.
 *
 * Everything that writes is counted in Postgres (`rate_hits`), so a limit holds across every
 * serverless instance instead of once per instance. Each kind can carry several windows: a
 * short one that stops bursts and a long one that stops slow, steady flooding.
 *
 * Reads (image fetches, duplicate search as you type) stay in memory: they are frequent, a
 * database write per read would cost more than it protects, and a per-instance cap is enough.
 */
type Window = { points: number; seconds: number };
const WRITES = {
  createIssue: [
    { points: 2, seconds: 5 * 60 },
    { points: 5, seconds: 24 * 3600 },
  ],
  createProposal: [
    { points: 1, seconds: 5 * 60 },
    { points: 3, seconds: 24 * 3600 },
  ],
  comment: [
    { points: 4, seconds: 60 },
    { points: 40, seconds: 3600 },
  ],
  vote: [
    { points: 20, seconds: 60 },
    { points: 300, seconds: 3600 },
  ],
  flag: [
    { points: 5, seconds: 10 * 60 },
    { points: 20, seconds: 24 * 3600 },
  ],
  stageMove: [
    { points: 2, seconds: 10 * 60 },
    { points: 6, seconds: 24 * 3600 },
  ],
  admin: [{ points: 120, seconds: 60 }],
} satisfies Record<string, Window[]>;

const READS = {
  search: new RateLimiterMemory({ keyPrefix: "search", points: 60, duration: 60 }),
  read: new RateLimiterMemory({ keyPrefix: "read", points: 240, duration: 60 }),
};

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(retryAfter > 3600 ? "You've hit today's limit. Try again tomorrow." : retryAfter > 90 ? `Slow down — try again in ${Math.ceil(retryAfter / 60)} min.` : `Slow down — try again in ${retryAfter}s.`);
  }
}

/** One fixed window in Postgres. Returns the count after this hit and the seconds until it resets. */
async function count(key: string, seconds: number) {
  const r = await db.execute<{ count: number; retry: number }>(sql`
    insert into rate_hits (key, count, reset_at) values (${key}, 1, now() + make_interval(secs => ${seconds}))
    on conflict (key) do update set
      count = case when rate_hits.reset_at < now() then 1 else rate_hits.count + 1 end,
      reset_at = case when rate_hits.reset_at < now() then now() + make_interval(secs => ${seconds}) else rate_hits.reset_at end
    returning count, greatest(1, ceil(extract(epoch from reset_at - now())))::int as retry`);
  return r.rows[0]!;
}

export async function limit(kind: keyof typeof WRITES | keyof typeof READS, key: string) {
  if (kind === "search" || kind === "read") {
    try {
      await READS[kind].consume(key);
    } catch (e) {
      if (e instanceof RateLimiterRes) throw new RateLimitError(Math.ceil(e.msBeforeNext / 1000));
      throw e;
    }
    return;
  }
  // Shortest window first: a burst is refused there and never eats into the daily allowance.
  const windows = [...WRITES[kind]].sort((a, b) => a.seconds - b.seconds);
  for (const w of windows) {
    const r = await count(`${kind}:${w.seconds}:${key}`, w.seconds);
    if (r.count > w.points) throw new RateLimitError(r.retry);
  }
}

/**
 * For limits that aren't tied to a signed-in user (sign-in codes per inbox, mail per day).
 * Returns false once `points` is used up.
 */
export async function hit(key: string, points: number, windowSeconds: number): Promise<boolean> {
  return (await count(key, windowSeconds)).count <= points;
}

/** Whether a marker set with `hit` is still live (used to tie a sign-in code to the browser that asked for it). */
export async function isLive(key: string): Promise<boolean> {
  const r = await db.execute<{ ok: boolean }>(sql`select exists (select 1 from rate_hits where key = ${key} and reset_at > now()) as ok`);
  return !!r.rows[0]?.ok;
}
