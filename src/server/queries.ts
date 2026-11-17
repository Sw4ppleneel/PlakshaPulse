import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  categories,
  comments,
  departments,
  issueEvents,
  issues,
  issueVotes,
  issueWatchers,
  locations,
  notifications,
  proposals,
  user,
  verifications,
} from "@/db/schema";
import { ACTIVE_STATUSES, HEAT_HALF_LIFE_HOURS, type Status } from "@/lib/constants";
import { canManage, isMod, type Viewer } from "./dal";

/* ───────────────────────── Taxonomy ───────────────────────── */

export async function getTaxonomy() {
  const [cats, locs, depts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sortOrder)),
    db.select().from(locations).orderBy(asc(locations.sortOrder)),
    db.select().from(departments).orderBy(asc(departments.name)),
  ]);
  return { categories: cats, locations: locs, departments: depts };
}
export type Taxonomy = Awaited<ReturnType<typeof getTaxonomy>>;

/* ───────────────────────── Board ───────────────────────── */

export type BoardIssue = {
  id: string;
  number: number;
  title: string;
  status: Status;
  categoryId: string;
  locationId: string | null;
  severity: "low" | "medium" | "high";
  metooCount: number;
  commentCount: number;
  heat: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  dueAt: string;
  viewerVoted: boolean;
  photoId: string | null;
  approval: "pending" | "approved" | "rejected";
};

export type BoardFilter = {
  view?: "active" | "fixed" | "all";
  category?: string;
  location?: string;
  sort?: "hot" | "new" | "top" | "updated";
  q?: string;
  mine?: "reported" | "watching";
  limit?: number;
};

const HALF_LIFE_S = HEAT_HALF_LIFE_HOURS * 3600;

export async function listIssues(viewer: Viewer, f: BoardFilter = {}): Promise<BoardIssue[]> {
  const statuses: Status[] =
    f.view === "fixed" ? ["resolved", "closed"] : f.view === "all" ? ["open", "acknowledged", "in_progress", "resolved", "closed", "wont_fix"] : ACTIVE_STATUSES;

  const where = [
    // Your own list includes what is still waiting for a moderator; nobody else's ever does.
    f.mine === "reported" ? sql`(i.hidden = false or i.approval <> 'approved')` : sql`i.hidden = false`,
    sql`i.status::text in (${sql.join(
      statuses.map((s) => sql`${s}`),
      sql`, `,
    )})`,
  ];
  if (f.category) where.push(sql`i.category_id = ${f.category}`);
  if (f.location) where.push(sql`i.location_id = ${f.location}`);
  if (f.q && f.q.trim().length >= 2) {
    const q = f.q.trim().slice(0, 100);
    where.push(sql`(i.title ilike ${"%" + q + "%"} or word_similarity(${q}, i.title) > 0.4 or i.number::text = ${q.replace(/^#/, "")})`);
  }
  if (f.mine === "reported") where.push(sql`i.reporter_id = ${viewer.id}`);
  if (f.mine === "watching") where.push(sql`exists (select 1 from issue_watchers w where w.issue_id = i.id and w.user_id = ${viewer.id})`);

  const order =
    f.sort === "new"
      ? sql`i.created_at desc`
      : f.sort === "top"
        ? sql`i.metoo_count desc, i.created_at desc`
        : f.sort === "updated"
          ? sql`coalesce(i.resolved_at, i.updated_at) desc`
          : sql`heat desc, i.created_at desc`;

  const rows = await db.execute<{
    id: string;
    number: number;
    title: string;
    status: Status;
    category_id: string;
    location_id: string | null;
    severity: "low" | "medium" | "high";
    metoo_count: number;
    comment_count: number;
    heat: number;
    created_at: Date;
    updated_at: Date;
    resolved_at: Date | null;
    due_at: Date;
    viewer_voted: boolean;
    photo_id: string | null;
    approval: "pending" | "approved" | "rejected";
  }>(sql`
    select i.id, i.number, i.title, i.status, i.category_id, i.location_id, i.severity, i.approval,
           i.metoo_count, i.comment_count, i.created_at, i.updated_at, i.resolved_at, i.due_at,
           coalesce(h.heat, 0) * case i.severity when 'high' then 1.6 when 'medium' then 1.25 else 1 end as heat,
           exists (select 1 from issue_votes mv where mv.issue_id = i.id and mv.user_id = ${viewer.id}) as viewer_voted,
           (select a.id from attachments a where a.issue_id = i.id and a.kind = 'report' order by a.created_at limit 1) as photo_id
    from issues i
    left join lateral (
      select sum(power(0.5, extract(epoch from (now() - v.created_at)) / ${HALF_LIFE_S}))::float8 as heat
      from issue_votes v where v.issue_id = i.id
    ) h on true
    where ${sql.join(where, sql` and `)}
    order by ${order}
    limit ${Math.min(f.limit ?? 200, 300)}
  `);

  return rows.rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    categoryId: r.category_id,
    locationId: r.location_id,
    severity: r.severity,
    metooCount: r.metoo_count,
    commentCount: r.comment_count,
    heat: Number(r.heat) || 0,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    dueAt: new Date(r.due_at).toISOString(),
    viewerVoted: r.viewer_voted,
    photoId: r.photo_id,
    approval: r.approval,
  }));
}

/* ───────────────────────── Similar (duplicate detection) ───────────────────────── */

export type SimilarIssue = {
  id: string;
  number: number;
  title: string;
  status: Status;
  categoryId: string;
  locationId: string | null;
  metooCount: number;
  viewerVoted: boolean;
  score: number;
};

const STOP = new Set(
  "the a an at in on of to is are was were and or for by no not my our it its from with this that there be been very so too after before during every all any some can cant doesnt dont isnt again still get got has have had near when what".split(" "),
);
/** Campus vocabulary: every word in a group is treated as the same concept. */
const SYNONYMS: string[][] = [
  ["wifi", "internet", "network", "eduroam", "connection", "net", "router", "portal", "signal"],
  ["hostel", "residence", "dorm", "room"],
  ["mess", "dining", "food", "dinner", "lunch", "breakfast", "meal", "canteen", "roti", "dal"],
  ["ac", "aircon", "cooling", "hvac"],
  ["heater", "heating", "cold", "winter"],
  ["water", "geyser", "tap", "plumbing", "shower"],
  ["leak", "drip", "leaking", "dripping"],
  ["light", "lamp", "dark", "bulb", "streetlight"],
  ["dirty", "clean", "cleanliness", "garbage", "trash", "smell", "bin", "overflow"],
  ["bus", "transport", "shuttle", "cab"],
  ["gym", "fitness", "treadmill", "workout"],
  ["doctor", "medical", "nurse", "sick", "fever", "health"],
  ["printer", "print", "toner"],
  ["slow", "drop", "disconnect", "lag", "speed"],
];
const CANON = new Map<string, string>();
for (const g of SYNONYMS) for (const w of g) CANON.set(w, g[0]!);

function stem(w: string) {
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/wi-?fi/g, "wifi")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => CANON.get(w) ?? CANON.get(stem(w)) ?? stem(w));
}

/**
 * Duplicate detection while filing. The candidate set (active, visible issues) is small, so we
 * score in-process: IDF-weighted keyword overlap with campus synonyms (title counts double), plus
 * trigram fuzziness from Postgres for typos, plus a nudge for matching category/location.
 */
export async function findSimilar(viewer: Viewer, q: string, categoryId?: string, locationId?: string) {
  const query = q.trim().slice(0, 140);
  const qTokens = [...new Set(tokens(query))];
  if (query.length < 4 || !qTokens.length) return [] as SimilarIssue[];

  const rows = await db.execute<{
    id: string;
    number: number;
    title: string;
    body: string;
    status: Status;
    category_id: string;
    location_id: string | null;
    metoo_count: number;
    viewer_voted: boolean;
    fuzzy: number;
  }>(sql`
    select i.id, i.number, i.title, i.body, i.status, i.category_id, i.location_id, i.metoo_count,
      exists (select 1 from issue_votes mv where mv.issue_id = i.id and mv.user_id = ${viewer.id}) as viewer_voted,
      word_similarity(${query.toLowerCase()}, lower(i.title))::float8 as fuzzy
    from issues i
    where i.hidden = false and i.status in ('open','acknowledged','in_progress','resolved')
    order by i.created_at desc
    limit 600
  `);

  const docs = rows.rows.map((r) => ({ r, title: new Set(tokens(r.title)), body: new Set(tokens(r.body)) }));
  const N = docs.length || 1;
  const idf = new Map(qTokens.map((t) => [t, Math.log(1 + N / (1 + docs.filter((d) => d.title.has(t) || d.body.has(t)).length))]));
  const total = qTokens.reduce((s, t) => s + idf.get(t)!, 0) || 1;

  return docs
    .map(({ r, title, body }) => {
      let hit = 0;
      for (const t of qTokens) hit += title.has(t) ? idf.get(t)! : body.has(t) ? idf.get(t)! * 0.45 : 0;
      const keyword = hit / total;
      const score =
        0.75 * keyword +
        0.25 * Number(r.fuzzy) +
        (categoryId && r.category_id === categoryId ? 0.12 : 0) +
        (locationId && r.location_id === locationId ? 0.08 : 0);
      return { r, score, keyword };
    })
    .filter((x) => x.score >= 0.42 && x.keyword > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ r, score }) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      status: r.status,
      categoryId: r.category_id,
      locationId: r.location_id,
      metooCount: r.metoo_count,
      viewerVoted: r.viewer_voted,
      score,
    }));
}

/* ───────────────────────── Issue detail ───────────────────────── */

export type TimelineItem =
  | {
      kind: "event";
      id: string;
      type: (typeof issueEvents.$inferSelect)["type"];
      fromStatus: Status | null;
      toStatus: Status | null;
      note: string | null;
      actor: string; // public label: a department, "The reporter", "Pulse"
      relatedNumber: number | null;
      createdAt: string;
    }
  | {
      kind: "comment";
      id: string;
      body: string;
      author: string;
      authorImage: string | null;
      official: boolean;
      departmentName: string | null;
      mine: boolean;
      hidden: boolean;
      approval: "pending" | "approved" | "rejected";
      createdAt: string;
      // only filled for admins
      realAuthor?: string;
    };

export async function getIssueDetail(viewer: Viewer, number: number) {
  const [row] = await db
    .select({
      issue: issues,
      category: categories,
      location: locations,
      department: departments,
      reporterName: user.name,
      reporterImage: user.image,
      reporterEmail: user.email,
    })
    .from(issues)
    .innerJoin(categories, eq(categories.id, issues.categoryId))
    .innerJoin(departments, eq(departments.id, issues.departmentId))
    .innerJoin(user, eq(user.id, issues.reporterId))
    .leftJoin(locations, eq(locations.id, issues.locationId))
    .where(eq(issues.number, number))
    .limit(1);
  if (!row) return null;

  const i = row.issue;
  const manage = canManage(viewer, i.departmentId);
  const isAdmin = viewer.role === "admin";
  const mod = isMod(viewer);
  const viewerIsReporter = i.reporterId === viewer.id;
  if (i.hidden && !manage && !mod && !viewerIsReporter) return null;

  const [events, commentRows, photos, voted, watching, verifs, mergedChildren, parent] = await Promise.all([
    db
      .select({ e: issueEvents, deptName: departments.name, related: issues.number })
      .from(issueEvents)
      .leftJoin(departments, eq(departments.id, issueEvents.departmentId))
      .leftJoin(issues, eq(issues.id, issueEvents.relatedIssueId))
      .where(eq(issueEvents.issueId, i.id))
      .orderBy(asc(issueEvents.createdAt)),
    db
      .select({ c: comments, name: user.name, image: user.image, role: user.role, deptId: user.departmentId })
      .from(comments)
      .innerJoin(user, eq(user.id, comments.authorId))
      .where(eq(comments.issueId, i.id))
      .orderBy(asc(comments.createdAt)),
    db
      .select({ id: attachments.id, kind: attachments.kind, width: attachments.width, height: attachments.height })
      .from(attachments)
      .where(eq(attachments.issueId, i.id))
      .orderBy(asc(attachments.createdAt)),
    db
      .select({ u: issueVotes.userId })
      .from(issueVotes)
      .where(and(eq(issueVotes.issueId, i.id), eq(issueVotes.userId, viewer.id))),
    db
      .select({ u: issueWatchers.userId })
      .from(issueWatchers)
      .where(and(eq(issueWatchers.issueId, i.id), eq(issueWatchers.userId, viewer.id))),
    db
      .select()
      .from(verifications)
      .where(and(eq(verifications.issueId, i.id), eq(verifications.round, i.reopenCount))),
    db
      .select({ number: issues.number, title: issues.title })
      .from(issues)
      .where(eq(issues.duplicateOfId, i.id)),
    i.duplicateOfId
      ? db.select({ number: issues.number, title: issues.title }).from(issues).where(eq(issues.id, i.duplicateOfId)).limit(1)
      : Promise.resolve([]),
  ]);

  const deptNames = new Map((await db.select().from(departments)).map((d) => [d.id, d.name]));

  const timeline: TimelineItem[] = [
    ...events.map(({ e, deptName, related }): TimelineItem => ({
      kind: "event",
      id: e.id,
      type: e.type,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actor:
        e.type === "created"
          ? "Reported"
          : e.actorRole === "staff" || e.actorRole === "admin"
            ? (deptName ?? "Campus admin")
            : e.actorId === null
              ? "Pulse"
              : e.actorId === i.reporterId
                ? "The reporter"
                : "A reporter",
      relatedNumber: related ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    ...commentRows
      .filter(({ c }) => !c.hidden || manage || mod || c.authorId === viewer.id)
      .map(({ c, name, image, deptId }): TimelineItem => ({
        kind: "comment",
        id: c.id,
        body: c.body,
        author: c.official ? (deptNames.get(deptId ?? "") ?? "Campus admin") : c.anonymous ? "Anonymous Plaksha member" : name,
        authorImage: c.anonymous || c.official ? null : image,
        official: c.official,
        departmentName: c.official ? (deptNames.get(deptId ?? "") ?? "Campus admin") : null,
        mine: c.authorId === viewer.id,
        hidden: c.hidden,
        approval: c.approval,
        createdAt: c.createdAt.toISOString(),
        realAuthor: isAdmin && (c.anonymous || c.official) ? name : undefined,
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const fixedVotes = verifs.filter((v) => v.fixed).length;
  const brokenVotes = verifs.length - fixedVotes;
  const viewerVerification = verifs.find((v) => v.userId === viewer.id);

  return {
    id: i.id,
    number: i.number,
    title: i.title,
    body: i.body,
    status: i.status,
    severity: i.severity,
    metooCount: i.metooCount,
    commentCount: i.commentCount,
    reopenCount: i.reopenCount,
    resolutionNote: i.resolutionNote,
    wontFixReason: i.wontFixReason,
    hidden: i.hidden,
    hiddenReason: manage || mod || viewerIsReporter ? i.hiddenReason : null,
    approval: i.approval,
    viewerIsMod: mod,
    locationDetail: i.locationDetail,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    closedAt: i.closedAt?.toISOString() ?? null,
    dueAt: i.dueAt.toISOString(),
    category: row.category,
    location: row.location,
    department: { id: row.department.id, name: row.department.name },
    anonymous: i.anonymous,
    reporter: i.anonymous && !isAdmin && !viewerIsReporter ? null : { name: row.reporterName, image: row.reporterImage },
    reporterEmail: isAdmin ? row.reporterEmail : null,
    viewerIsReporter,
    viewerVoted: voted.length > 0,
    viewerWatching: watching.length > 0,
    viewerCanManage: manage,
    viewerIsAdmin: isAdmin,
    verification: {
      fixed: fixedVotes,
      broken: brokenVotes,
      viewer: (viewerVerification ? (viewerVerification.fixed ? "fixed" : "broken") : null) as "fixed" | "broken" | null,
      viewerEligible: i.status === "resolved" && voted.length > 0 && !viewerVerification,
    },
    photos: photos.filter((p) => p.kind === "report"),
    resolutionPhotos: photos.filter((p) => p.kind === "resolution"),
    timeline,
    mergedChildren,
    duplicateOf: parent[0] ?? null,
  };
}
export type IssueDetail = NonNullable<Awaited<ReturnType<typeof getIssueDetail>>>;

/* ───────────────────────── Stats & scoreboard ───────────────────────── */

export async function getPulseStats() {
  const r = await db.execute<{
    active: number;
    reported_week: number;
    fixed_week: number;
    median_hours: number | null;
    on_time: number | null;
    people: number;
  }>(sql`
    select
      count(*) filter (where status in ('open','acknowledged','in_progress','resolved') and not hidden)::int as active,
      count(*) filter (where created_at > now() - interval '7 days' and not hidden)::int as reported_week,
      count(*) filter (where resolved_at > now() - interval '7 days' and status in ('resolved','closed'))::int as fixed_week,
      (percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at) / 3600)
        filter (where resolved_at > now() - interval '30 days' and status in ('resolved','closed')))::float8 as median_hours,
      (avg(case when resolved_at <= due_at then 1.0 else 0.0 end)
        filter (where resolved_at > now() - interval '30 days' and status in ('resolved','closed')))::float8 as on_time,
      (select count(distinct user_id) from issue_votes where created_at > now() - interval '30 days')::int as people
    from issues
  `);
  const s = r.rows[0]!;
  return {
    active: s.active,
    reportedWeek: s.reported_week,
    fixedWeek: s.fixed_week,
    medianHours: s.median_hours,
    onTime: s.on_time,
    people: s.people,
  };
}

export async function getDepartmentScoreboard() {
  const r = await db.execute<{
    id: string;
    name: string;
    description: string | null;
    open: number;
    overdue: number;
    fixed_30: number;
    median_hours: number | null;
    median_ack_hours: number | null;
    on_time: number | null;
    fixed_prev_30: number;
    reopened: number;
  }>(sql`
    select d.id, d.name, d.description,
      count(i.*) filter (where i.status in ('open','acknowledged','in_progress') and not i.hidden)::int as open,
      count(i.*) filter (where i.status in ('open','acknowledged','in_progress') and i.due_at < now() and not i.hidden)::int as overdue,
      count(i.*) filter (where i.resolved_at > now() - interval '30 days' and i.status in ('resolved','closed'))::int as fixed_30,
      count(i.*) filter (where i.resolved_at between now() - interval '60 days' and now() - interval '30 days' and i.status in ('resolved','closed'))::int as fixed_prev_30,
      (percentile_cont(0.5) within group (order by extract(epoch from i.resolved_at - i.created_at) / 3600)
        filter (where i.resolved_at > now() - interval '90 days' and i.status in ('resolved','closed')))::float8 as median_hours,
      (percentile_cont(0.5) within group (order by extract(epoch from i.acknowledged_at - i.created_at) / 3600)
        filter (where i.acknowledged_at > now() - interval '90 days'))::float8 as median_ack_hours,
      (avg(case when i.resolved_at <= i.due_at then 1.0 else 0.0 end)
        filter (where i.resolved_at > now() - interval '90 days' and i.status in ('resolved','closed')))::float8 as on_time,
      coalesce(sum(i.reopen_count) filter (where i.created_at > now() - interval '90 days'), 0)::int as reopened
    from departments d
    left join issues i on i.department_id = d.id
    group by d.id
    order by open desc, d.name
  `);
  return r.rows.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    open: d.open,
    overdue: d.overdue,
    fixed30: d.fixed_30,
    fixedPrev30: d.fixed_prev_30,
    medianHours: d.median_hours,
    medianAckHours: d.median_ack_hours,
    onTime: d.on_time,
    reopened: d.reopened,
  }));
}

export async function listRecentlyFixed(limit = 40) {
  const rows = await db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      categoryId: issues.categoryId,
      departmentName: departments.name,
      resolutionNote: issues.resolutionNote,
      metooCount: issues.metooCount,
      createdAt: issues.createdAt,
      resolvedAt: issues.resolvedAt,
      dueAt: issues.dueAt,
    })
    .from(issues)
    .innerJoin(departments, eq(departments.id, issues.departmentId))
    .where(and(inArray(issues.status, ["resolved", "closed"]), eq(issues.hidden, false)))
    .orderBy(desc(issues.resolvedAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    dueAt: r.dueAt.toISOString(),
  }));
}

/* ───────────────────────── Notifications ───────────────────────── */

export async function getNotifications(viewer: Viewer, limit = 30) {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      message: notifications.message,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      issueNumber: issues.number,
      issueTitle: issues.title,
      proposalNumber: proposals.number,
    })
    .from(notifications)
    .leftJoin(issues, eq(issues.id, notifications.issueId))
    .leftJoin(proposals, eq(proposals.id, notifications.proposalId))
    .where(eq(notifications.userId, viewer.id))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, readAt: r.readAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() }));
}

export async function getUnreadCount(viewer: Viewer) {
  const r = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from notifications where user_id = ${viewer.id} and read_at is null`,
  );
  return r.rows[0]?.n ?? 0;
}
