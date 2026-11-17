import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
const db = drizzle(pool);
// Two deploys building at once must not both apply the same migration.
const lock = await pool.connect();
await lock.query("select pg_advisory_lock(7020431)");
try {
  await pool.query("create extension if not exists pg_trgm");
  await migrate(db, { migrationsFolder: "./drizzle" });
} finally {
  await lock.query("select pg_advisory_unlock(7020431)");
  lock.release();
}
console.log("✓ migrations applied");
await pool.end();
