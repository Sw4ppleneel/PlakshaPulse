import "dotenv/config";
import { Pool } from "pg";
if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("drop schema public cascade; create schema public; drop schema if exists drizzle cascade;");
console.log("✓ database reset");
await pool.end();
