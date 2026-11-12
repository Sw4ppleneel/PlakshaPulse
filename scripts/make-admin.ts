/** Promote an existing user (they must have signed in once): npm run make-admin -- someone@plaksha.edu.in */
import "dotenv/config";
import { Pool } from "pg";

const email = process.argv[2]?.toLowerCase();
if (!email) throw new Error("Usage: npm run make-admin -- <email>");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(`update "user" set role = 'admin', updated_at = now() where email = $1 returning id`, [email]);
console.log(r.rowCount ? `✓ ${email} is now an admin` : `✗ no user with email ${email} — sign in once first, or add to ADMIN_EMAILS`);
if (r.rowCount) await pool.query(`insert into audit_log (action, target_type, target_id, detail) values ('set_role', 'user', $1, 'admin via CLI')`, [r.rows[0].id]);
await pool.end();
