import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { VERIFY_WINDOW_DAYS } from "@/lib/constants";

let lastRun = 0;

/**
 * Housekeeping that would normally be a cron job: issues marked fixed that nobody disputed
 * within the verification window become "Verified fixed". Safe to call often — it's throttled
 * in-process and the SQL is idempotent. `scripts/sweep.ts` runs the same thing from cron.
 */
export async function sweep(force = false) {
  const now = Date.now();
  if (!force && now - lastRun < 5 * 60_000) return 0;
  lastRun = now;
  const r = await db.execute<{ id: string; number: number }>(sql`
    with closed as (
      update issues set status = 'closed', closed_at = now(), updated_at = now()
      where status = 'resolved' and resolved_at < now() - make_interval(days => ${VERIFY_WINDOW_DAYS})
      returning id, number
    ), ev as (
      insert into issue_events (issue_id, type, from_status, to_status, note)
      select id, 'verified', 'resolved', 'closed', 'No one reported it still broken within ${sql.raw(String(VERIFY_WINDOW_DAYS))} days.' from closed
    ), notif as (
      insert into notifications (user_id, issue_id, kind, message)
      select w.user_id, c.id, 'status', '#' || c.number || ' auto-closed as fixed after the confirmation window.'
      from closed c join issue_watchers w on w.issue_id = c.id
    )
    select id, number from closed`);
  return r.rows.length;
}
