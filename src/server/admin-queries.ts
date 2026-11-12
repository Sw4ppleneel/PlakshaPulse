import "server-only";
import { desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, user } from "@/db/schema";
import type { Viewer } from "./dal";

export type QueueItem = {
  id: string;
  number: number;
  title: string;
  status: "open" | "acknowledged" | "in_progress" | "resolved";
  category_id: string;
  department_id: string;
  metoo_count: number;
  severity: string;
  created_at: Date;
  due_at: Date;
  hidden: boolean;
};

/** Staff see their department's queue; admins see everything. Scope is decided here, server-side. */
export async function getTriage(viewer: Viewer) {
  const scope = viewer.role === "admin" ? sql`true` : sql`i.department_id = ${viewer.departmentId ?? "__none__"}`;
  const q = (where: ReturnType<typeof sql>, order: ReturnType<typeof sql>) =>
    db.execute<QueueItem>(sql`
      select i.id, i.number, i.title, i.status, i.category_id, i.department_id, i.metoo_count, i.severity, i.created_at, i.due_at, i.hidden
      from issues i where ${scope} and ${where} order by ${order} limit 50`);
  const [untriaged, overdue, awaiting] = await Promise.all([
    q(sql`i.status = 'open' and not i.hidden`, sql`(i.severity = 'high') desc, i.metoo_count desc, i.created_at`),
    q(sql`i.status in ('open','acknowledged','in_progress') and i.due_at < now() and not i.hidden`, sql`i.due_at`),
    q(sql`i.status = 'resolved'`, sql`i.resolved_at`),
  ]);
  return { untriaged: untriaged.rows, overdue: overdue.rows, awaiting: awaiting.rows };
}

export async function getFlagQueue() {
  const r = await db.execute<{
    target_type: "issue" | "comment";
    target_id: string;
    issue_number: number;
    issue_title: string;
    excerpt: string;
    hidden: boolean;
    flags: number;
    reasons: string[];
    last_at: Date;
  }>(sql`
    select f.target_type, f.target_id, i.number as issue_number, i.title as issue_title,
      case when f.target_type = 'issue' then left(i.title || ' — ' || i.body, 220) else left(c.body, 220) end as excerpt,
      case when f.target_type = 'issue' then i.hidden else coalesce(c.hidden, false) end as hidden,
      count(*)::int as flags, array_agg(distinct f.reason) as reasons, max(f.created_at) as last_at
    from flags f
    join issues i on i.id = f.issue_id
    left join comments c on c.id = f.target_id and f.target_type = 'comment'
    where not f.resolved
    group by f.target_type, f.target_id, i.number, i.title, i.body, i.hidden, c.body, c.hidden
    order by flags desc, last_at desc
    limit 50`);
  return r.rows;
}

export async function searchPeople(q: string) {
  const term = q.trim().slice(0, 80);
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      departmentId: user.departmentId,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(term ? or(ilike(user.email, `%${term}%`), ilike(user.name, `%${term}%`)) : sql`${user.role} <> 'member' or ${user.banned}`)
    .orderBy(desc(user.role), user.name)
    .limit(60);
  const depts = await db.select({ id: departments.id, name: departments.name }).from(departments);
  return { rows, depts };
}
