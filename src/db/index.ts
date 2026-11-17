import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Serverless: many small instances, each needing few connections. Neon's pooled endpoint
    // multiplexes them; idle ones close quickly and a stuck connect fails instead of hanging.
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
