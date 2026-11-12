/** Cron entry point: auto-close resolved issues past the verification window. */
import "dotenv/config";
import { Pool } from "pg";

const DAYS = 7;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(
  `with closed as (
     update issues set status = 'closed', closed_at = now(), updated_at = now()
     where status = 'resolved' and resolved_at < now() - make_interval(days => $1)
     returning id, number
   ), ev as (
     insert into issue_events (issue_id, type, from_status, to_status, note)
     select id, 'verified', 'resolved', 'closed', 'No one reported it still broken within ' || $1 || ' days.' from closed
   )
   select count(*)::int as n from closed`,
  [DAYS],
);
console.log(`✓ auto-closed ${r.rows[0].n} issue(s)`);
await pool.end();
