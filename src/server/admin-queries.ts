import "server-only";
import { desc, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, user } from "@/db/schema";
import { STAGE_META } from "@/lib/constants";
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

export type ReviewItem = {
  kind: "issue" | "proposal" | "comment" | "post" | "reason";
  id: string;
  href: string;
  /** What it is attached to, e.g. "#12 Wi-Fi drops…" for a comment. Null for a new issue or proposal. */
  context: string | null;
  title: string | null;
  text: string;
  author: string | null;
  photos: number;
  createdAt: string;
};

/**
 * Everything waiting for a moderator, oldest first. Names of people who posted anonymously are
 * only included for admins; moderators see the content, not who wrote it.
 */
export async function getReviewQueue(viewer: Viewer): Promise<ReviewItem[]> {
  const named = viewer.role === "admin";
  const r = await db.execute<{ kind: ReviewItem["kind"]; id: string; num: number; ctx: string | null; title: string | null; text: string; author: string; anon: boolean; photos: number; at: Date }>(sql`
    select * from (
      select 'issue' as kind, i.id::text as id, i.number as num, null::text as ctx, i.title, i.body as text, u.name as author, i.anonymous as anon,
             (select count(*) from attachments a where a.issue_id = i.id)::int as photos, i.created_at as at
      from issues i join "user" u on u.id = i.reporter_id where i.approval = 'pending'
      union all
      select 'proposal', p.id::text, p.number, null, p.title, p.ask || case when p.body <> '' then E'\n\n' || p.body else '' end, u.name, false,
             (select count(*) from attachments a where a.proposal_id = p.id)::int, p.created_at
      from proposals p join "user" u on u.id = p.author_id where p.approval = 'pending'
      union all
      select 'comment', c.id::text, i.number, '#' || i.number || ' ' || i.title, null, c.body, u.name, c.anonymous, 0, c.created_at
      from comments c join issues i on i.id = c.issue_id join "user" u on u.id = c.author_id where c.approval = 'pending'
      union all
      select 'post', x.id::text, p.number, 'P-' || p.number || ' ' || p.title, null, coalesce(x.body, ''), u.name, false, 0, x.created_at
      from proposal_posts x join proposals p on p.id = x.proposal_id join "user" u on u.id = x.author_id where x.approval = 'pending'
      union all
      select 'reason', s.proposal_id::text || ':' || s.user_id, p.number, 'P-' || p.number || ' ' || p.title, null, coalesce(s.reason, ''), u.name, not s.show_name, 0, s.created_at
      from proposal_supports s join proposals p on p.id = s.proposal_id join "user" u on u.id = s.user_id where s.reason_approval = 'pending'
    ) q order by at limit 100`);
  return r.rows.map((x) => ({
    kind: x.kind,
    id: x.id,
    href: x.kind === "issue" || x.kind === "comment" ? `/issues/${x.num}` : `/proposals/${x.num}`,
    context: x.ctx,
    title: x.title,
    text: x.text,
    author: x.anon && !named ? null : x.author,
    photos: x.photos,
    createdAt: new Date(x.at).toISOString(),
  }));
}

/** How many posts are waiting for a moderator; shown on the nav for moderators. */
export async function getReviewCount() {
  const r = await db.execute<{ n: number }>(sql`
    select (select count(*) from issues where approval = 'pending')
         + (select count(*) from proposals where approval = 'pending')
         + (select count(*) from comments where approval = 'pending')
         + (select count(*) from proposal_posts where approval = 'pending')
         + (select count(*) from proposal_supports where reason_approval = 'pending') as n`);
  return Number(r.rows[0]?.n ?? 0);
}

export type HiddenItem = {
  kind: "issue" | "proposal" | "comment";
  id: string;
  href: string;
  title: string;
  context: string | null;
  author: string;
  /** "rejected" when a moderator turned it down from the queue; "hidden" when it was taken down after going public. */
  state: "rejected" | "hidden";
  reason: string | null;
  at: string;
};

/**
 * Everything that has been hidden or rejected, newest first, so a moderator can find it again and
 * restore it. Pending items are not here; they are in the approval queue.
 */
export async function getHiddenContent(): Promise<HiddenItem[]> {
  const r = await db.execute<{ kind: HiddenItem["kind"]; id: string; num: number; title: string; ctx: string | null; author: string; approval: string; reason: string | null; at: Date }>(sql`
    select * from (
      select 'issue' as kind, i.id::text as id, i.number as num, i.title, null::text as ctx, u.name as author, i.approval::text as approval, i.hidden_reason as reason, i.updated_at as at
      from issues i join "user" u on u.id = i.reporter_id where i.hidden and i.approval <> 'pending'
      union all
      select 'proposal', p.id::text, p.number, p.title, null, u.name, p.approval::text, p.hidden_reason, p.updated_at
      from proposals p join "user" u on u.id = p.author_id where p.hidden and p.approval <> 'pending'
      union all
      select 'comment', c.id::text, i.number, c.body, '#' || i.number || ' ' || i.title, u.name, c.approval::text, null, c.created_at
      from comments c join issues i on i.id = c.issue_id join "user" u on u.id = c.author_id where c.hidden and c.approval <> 'pending'
    ) q order by at desc limit 100`);
  return r.rows.map((x) => ({
    kind: x.kind,
    id: x.id,
    href: x.kind === "proposal" ? `/proposals/${x.num}` : `/issues/${x.num}`,
    title: x.title,
    context: x.ctx,
    author: x.author,
    state: x.approval === "rejected" ? "rejected" : "hidden",
    reason: x.reason,
    at: new Date(x.at).toISOString(),
  }));
}

export type LogEntry = { id: string; actor: string; text: string; href: string | null; note: string | null; at: string };

const ACTION_TEXT: Record<string, string> = {
  hide: "hid",
  restore: "restored",
  approve: "approved",
  reject: "rejected",
  dismiss_flags: "dismissed the flags on",
  "proposal.hide": "hid",
  "proposal.restore": "restored",
  "proposal_post.hide": "hid a post on",
  "proposal_post.restore": "restored a post on",
  set_role: "changed the role of",
  ban: "suspended",
  unban: "lifted the suspension of",
};

/**
 * The moderation log: who hid, restored, approved, rejected or changed what, newest first. It reads
 * the private audit log, which every moderator and admin action writes to. Moderators see content
 * decisions; role changes and suspensions are listed for admins only.
 */
export async function getModerationLog(viewer: Viewer, limit = 60): Promise<LogEntry[]> {
  const adminOnly = viewer.role === "admin" ? sql`true` : sql`a.target_type <> 'user'`;
  const r = await db.execute<{ id: string; actor: string | null; action: string; target_type: string; detail: string | null; at: Date; num: number | null; label: string | null; is_proposal: boolean }>(sql`
    select a.id, au.name as actor, a.action, a.target_type, a.detail, a.created_at as at,
      coalesce(i.number, ci.number, p.number, xp.number, rp.number) as num,
      coalesce(i.title, 'a comment on #' || ci.number || ' ' || ci.title, p.title, xp.title, 'a supporter''s reason on P-' || rp.number, tu.name) as label,
      (p.id is not null or xp.id is not null or rp.id is not null) as is_proposal
    from audit_log a
    left join "user" au on au.id = a.actor_id
    left join issues i on a.target_type = 'issue' and i.id::text = a.target_id
    left join comments c on a.target_type = 'comment' and c.id::text = a.target_id
    left join issues ci on ci.id = c.issue_id
    left join proposals p on a.target_type = 'proposal' and p.id::text = a.target_id
    left join proposal_posts x on a.target_type in ('proposal_post', 'post') and x.id::text = a.target_id
    left join proposals xp on xp.id = x.proposal_id
    left join proposals rp on a.target_type = 'reason' and rp.id::text = split_part(a.target_id, ':', 1)
    left join "user" tu on a.target_type = 'user' and tu.id = a.target_id
    where (a.action in (${sql.join(
      Object.keys(ACTION_TEXT).map((k) => sql`${k}`),
      sql`, `,
    )}) or a.action like 'proposal.%')
      and ${adminOnly}
    order by a.created_at desc
    limit ${limit}`);
  return r.rows.map((x) => {
    const what = x.label ? (x.target_type === "issue" ? `#${x.num} ${x.label}` : x.target_type === "proposal" ? `P-${x.num} ${x.label}` : x.label) : "something that has since been deleted";
    const stage = x.action.startsWith("proposal.") && !ACTION_TEXT[x.action] ? (STAGE_META as Record<string, { label: string }>)[x.action.slice(9)]?.label : undefined;
    const text = stage ? `moved ${what} to ${stage}` : `${ACTION_TEXT[x.action] ?? x.action} ${what}`;
    const note = x.action === "set_role" ? `now ${x.detail?.split(":")[0] ?? ""}` : x.detail;
    return {
      id: x.id,
      actor: x.actor ?? "Someone",
      text,
      href: x.num == null ? null : x.is_proposal ? `/proposals/${x.num}` : `/issues/${x.num}`,
      note: note || null,
      at: new Date(x.at).toISOString(),
    };
  });
}
