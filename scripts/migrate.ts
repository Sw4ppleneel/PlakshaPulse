import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
await pool.query("create extension if not exists pg_trgm");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ migrations applied");
await pool.end();
