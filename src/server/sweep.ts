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
  // Rate-limit counters whose window ended over a day ago are dead weight.
  await db.execute(sql`delete from rate_hits where reset_at < now() - interval '1 day'`);
  const r = await db.execute<{ id: string; number: number }>(sql`
    with closed as (
      update issues i set status = 'closed', closed_at = now(), updated_at = now()
      where i.status = 'resolved' and not i.hidden
        and i.resolved_at < now() - make_interval(days => ${VERIFY_WINDOW_DAYS})
        -- If anyone affected said it's still broken this round, it isn't closed as fixed on silence;
        -- it waits for the office instead.
        and not exists (
          select 1 from verifications v
          where v.issue_id = i.id and v.round = i.reopen_count and not v.fixed
        )
      returning i.id, i.number
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
