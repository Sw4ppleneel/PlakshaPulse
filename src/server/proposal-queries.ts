import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, departments, proposalPosts, proposals, proposalSupports, trialCheckins, user, type ProposalStage, type Usage } from "@/db/schema";
import { OPEN_STAGES } from "@/lib/constants";
import { canManage, isMod, type Viewer } from "./dal";

/** Campus-local calendar day, used for trial check-ins. */
export function campusDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export type ProposalCard = {
  id: string;
  number: number;
  title: string;
  ask: string;
  area: string;
  stage: ProposalStage;
  goal: number;
  supportCount: number;
  commentCount: number;
  weeklyUsers: number;
  volunteers: number;
  departmentName: string | null;
  authorName: string;
  createdAt: string;
  stageChangedAt: string;
  viewerSupports: boolean;
  /** Supporters gained in the last 7 days. */
  recent: number;
  trialEndsOn: string | null;
  trialStartsOn: string | null;
  coverId: string | null;
  approval: "pending" | "approved" | "rejected";
};

export async function listProposals(viewer: Viewer, opts: { stage?: "open" | "done" | ProposalStage; area?: string; mine?: boolean } = {}) {
  const stageFilter =
    !opts.stage || opts.stage === "open"
      ? sql`p.stage in ('gathering','in_review','trial')`
      : opts.stage === "done"
        ? sql`p.stage in ('adopted','declined','withdrawn')`
        : sql`p.stage = ${opts.stage}`;
  const areaFilter = opts.area ? sql`and p.area = ${opts.area}` : sql``;
  const mineFilter = opts.mine ? sql`and exists (select 1 from proposal_supports s where s.proposal_id = p.id and s.user_id = ${viewer.id})` : sql``;
  // Pending proposals belong in the approval queue, not the list. Ones a moderator hid after
  // approval stay listed for moderators so they can be found and restored.
  const hiddenFilter = isMod(viewer) ? sql`and (not p.hidden or p.author_id = ${viewer.id} or p.approval = 'approved')` : sql`and (not p.hidden or p.author_id = ${viewer.id})`;

  const rows = await db.execute<{
    id: string;
    number: number;
    title: string;
    ask: string;
    area: string;
    stage: ProposalStage;
    goal: number;
    support_count: number;
    comment_count: number;
    weekly: number;
    volunteers: number;
    recent: number;
    dept: string | null;
    author: string;
    created_at: Date;
    stage_changed_at: Date;
    trial_ends_on: string | null;
    trial_starts_on: string | null;
    cover: string | null;
    approval: "pending" | "approved" | "rejected";
    mine: boolean;
  }>(sql`
    select p.id, p.number, p.title, p.ask, p.area, p.stage, p.goal, p.support_count, p.comment_count, p.approval,
           p.created_at, p.stage_changed_at, p.trial_ends_on, p.trial_starts_on, d.name as dept, u.name as author,
           coalesce(agg.weekly, 0)::int as weekly, coalesce(agg.volunteers, 0)::int as volunteers, coalesce(agg.recent, 0)::int as recent,
           (select a.id from attachments a where a.proposal_id = p.id order by a.created_at limit 1) as cover,
           exists (select 1 from proposal_supports s where s.proposal_id = p.id and s.user_id = ${viewer.id}) as mine
    from proposals p
    join "user" u on u.id = p.author_id
    left join departments d on d.id = p.department_id
    left join lateral (
      select count(*) filter (where s.usage = 'often') as weekly,
             count(*) filter (where s.volunteer) as volunteers,
             count(*) filter (where s.created_at > now() - interval '7 days') as recent
      from proposal_supports s where s.proposal_id = p.id
    ) agg on true
    where ${stageFilter} ${areaFilter} ${mineFilter} ${hiddenFilter}
    order by case p.stage when 'trial' then 0 when 'in_review' then 1 when 'gathering' then 2 else 3 end,
             coalesce(agg.recent, 0) desc, p.support_count desc, p.created_at desc
    limit 200`);

  return rows.rows.map(
    (r): ProposalCard => ({
      id: r.id,
      number: r.number,
      title: r.title,
      ask: r.ask,
      area: r.area,
      stage: r.stage,
      goal: r.goal,
      supportCount: r.support_count,
      commentCount: r.comment_count,
      weeklyUsers: r.weekly,
      volunteers: r.volunteers,
      recent: r.recent,
      departmentName: r.dept,
      authorName: r.author,
      createdAt: new Date(r.created_at).toISOString(),
      stageChangedAt: new Date(r.stage_changed_at).toISOString(),
      trialEndsOn: r.trial_ends_on,
      trialStartsOn: r.trial_starts_on,
      coverId: r.cover,
      approval: r.approval,
      viewerSupports: r.mine,
    }),
  );
}

export async function getProposalStats() {
  const r = await db.execute<{ open: number; supporters: number; people: number; adopted: number; trials: number }>(sql`
    select count(*) filter (where stage in ('gathering','in_review','trial') and not hidden)::int as open,
           count(*) filter (where stage = 'adopted')::int as adopted,
           count(*) filter (where stage = 'trial')::int as trials,
           (select count(*) from proposal_supports)::int as supporters,
           (select count(distinct user_id) from proposal_supports)::int as people
    from proposals`);
  return r.rows[0]!;
}

/** Everything the evidence pack and the detail page need, computed live from the raw rows. */
export async function getEvidence(proposalId: string) {
  const [byCohort, byUsage, growth, reasons, named, checkins, checkinDays] = await Promise.all([
    db.execute<{ cohort: string; n: number }>(sql`
      select coalesce(nullif(cohort, ''), 'Not stated') as cohort, count(*)::int as n
      from proposal_supports where proposal_id = ${proposalId} group by 1 order by 2 desc`),
    db.execute<{ usage: Usage; n: number; volunteers: number }>(sql`
      select usage, count(*)::int as n, count(*) filter (where volunteer)::int as volunteers
      from proposal_supports where proposal_id = ${proposalId} group by 1`),
    db.execute<{ day: string; n: number }>(sql`
      select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, count(*)::int as n
      from proposal_supports where proposal_id = ${proposalId} group by 1 order by 1`),
    db
      .select({ reason: proposalSupports.reason, cohort: proposalSupports.cohort, usage: proposalSupports.usage, showName: proposalSupports.showName, name: user.name, at: proposalSupports.createdAt })
      .from(proposalSupports)
      .innerJoin(user, eq(user.id, proposalSupports.userId))
      .where(and(eq(proposalSupports.proposalId, proposalId), sql`coalesce(${proposalSupports.reason}, '') <> ''`, eq(proposalSupports.reasonApproval, "approved")))
      .orderBy(desc(proposalSupports.createdAt))
      .limit(60),
    db
      .select({ name: user.name, cohort: proposalSupports.cohort, volunteer: proposalSupports.volunteer })
      .from(proposalSupports)
      .innerJoin(user, eq(user.id, proposalSupports.userId))
      .where(and(eq(proposalSupports.proposalId, proposalId), eq(proposalSupports.showName, true)))
      .orderBy(asc(user.name)),
    db.execute<{ total: number; people: number; good: number; ok: number; bad: number }>(sql`
      select count(*)::int as total, count(distinct user_id)::int as people,
             count(*) filter (where rating = 3)::int as good, count(*) filter (where rating = 2)::int as ok,
             count(*) filter (where rating = 1)::int as bad
      from trial_checkins where proposal_id = ${proposalId}`),
    db.execute<{ day: string; n: number; good: number }>(sql`
      select day, count(*)::int as n, count(*) filter (where rating = 3)::int as good
      from trial_checkins where proposal_id = ${proposalId} group by day order by day`),
  ]);

  const usage = { often: 0, sometimes: 0, backing: 0 } as Record<Usage, number>;
  let volunteers = 0;
  for (const r of byUsage.rows) {
    usage[r.usage] = r.n;
    volunteers += r.volunteers;
  }
  let running = 0;
  const cumulative = growth.rows.map((g) => ({ day: g.day, total: (running += g.n), added: g.n }));

  return {
    cohorts: byCohort.rows,
    usage,
    volunteers,
    growth: cumulative,
    reasons: reasons.map((r) => ({
      reason: r.reason!,
      who: r.showName ? r.name : r.cohort ? `A member of ${r.cohort}` : "A Plaksha member",
      cohort: r.showName ? r.cohort : null,
      usage: r.usage,
      at: r.at.toISOString(),
    })),
    named,
    trial: { ...checkins.rows[0]!, days: checkinDays.rows },
  };
}
export type Evidence = Awaited<ReturnType<typeof getEvidence>>;

export async function getProposalDetail(viewer: Viewer, number: number) {
  const [row] = await db
    .select({ p: proposals, authorName: user.name, authorImage: user.image, authorCohort: user.cohort, deptName: departments.name })
    .from(proposals)
    .innerJoin(user, eq(user.id, proposals.authorId))
    .leftJoin(departments, eq(departments.id, proposals.departmentId))
    .where(eq(proposals.number, number))
    .limit(1);
  if (!row) return null;
  const p = row.p;
  const isAdmin = viewer.role === "admin";
  const isAuthor = p.authorId === viewer.id;
  const canDecide = isAdmin || (!!p.departmentId && canManage(viewer, p.departmentId));
  const mod = isMod(viewer);
  if (p.hidden && !mod && !isAuthor) return null;

  const today = campusDay();
  const [posts, mine, myCheckin, evidence, photos] = await Promise.all([
    db
      .select({ post: proposalPosts, name: user.name, image: user.image, role: user.role })
      .from(proposalPosts)
      .leftJoin(user, eq(user.id, proposalPosts.authorId))
      .where(and(eq(proposalPosts.proposalId, p.id), mod ? sql`true` : sql`(not ${proposalPosts.hidden} or ${proposalPosts.authorId} = ${viewer.id})`))
      .orderBy(asc(proposalPosts.createdAt)),
    db.select().from(proposalSupports).where(and(eq(proposalSupports.proposalId, p.id), eq(proposalSupports.userId, viewer.id))).limit(1),
    db
      .select()
      .from(trialCheckins)
      .where(and(eq(trialCheckins.proposalId, p.id), eq(trialCheckins.userId, viewer.id), eq(trialCheckins.day, today)))
      .limit(1),
    getEvidence(p.id),
    db.select({ id: attachments.id }).from(attachments).where(eq(attachments.proposalId, p.id)).orderBy(asc(attachments.createdAt)),
  ]);

  // Collection runs from the first support until now, or until the decision froze the evidence.
  const firstDay = evidence.growth[0]?.day;
  const until = OPEN_STAGES.includes(p.stage) ? Date.now() : p.stageChangedAt.getTime();
  const collectionDays = firstDay ? Math.max(1, Math.round((until - new Date(firstDay + "T00:00:00+05:30").getTime()) / 86_400_000)) : 0;

  return {
    collectionDays,
    generatedAt: new Date().toISOString(),
    photos: photos.map((x) => x.id),
    id: p.id,
    number: p.number,
    title: p.title,
    ask: p.ask,
    body: p.body,
    area: p.area,
    stage: p.stage,
    goal: p.goal,
    supportCount: p.supportCount,
    commentCount: p.commentCount,
    departmentId: p.departmentId,
    departmentName: row.deptName,
    trialPlan: p.trialPlan,
    trialStartsOn: p.trialStartsOn,
    trialEndsOn: p.trialEndsOn,
    decisionNote: p.decisionNote,
    hidden: p.hidden,
    hiddenReason: p.hiddenReason,
    approval: p.approval,
    viewerIsMod: mod,
    createdAt: p.createdAt.toISOString(),
    stageChangedAt: p.stageChangedAt.toISOString(),
    author: { name: row.authorName, image: row.authorImage, cohort: row.authorCohort },
    viewerIsAuthor: isAuthor,
    viewerIsAdmin: isAdmin,
    viewerCanDecide: canDecide,
    viewerSupport: mine[0] ? { usage: mine[0].usage, volunteer: mine[0].volunteer, showName: mine[0].showName, reason: mine[0].reason, reasonApproval: mine[0].reasonApproval } : null,
    viewerCheckedInToday: !!myCheckin[0],
    trialLive: p.stage === "trial" && (!p.trialStartsOn || p.trialStartsOn <= today) && (!p.trialEndsOn || today <= p.trialEndsOn),
    today,
    open: OPEN_STAGES.includes(p.stage),
    posts: posts.map(({ post, name, image, role }) => ({
      id: post.id,
      kind: post.kind,
      fromStage: post.fromStage,
      toStage: post.toStage,
      official: post.official,
      body: post.body,
      hidden: post.hidden,
      approval: post.approval,
      mine: post.authorId === viewer.id,
      createdAt: post.createdAt.toISOString(),
      author: name ? { name, image, role } : null,
      byAuthor: post.authorId === p.authorId,
    })),
    evidence,
  };
}
export type ProposalDetail = NonNullable<Awaited<ReturnType<typeof getProposalDetail>>>;

export async function getViewerCohort(viewer: Viewer) {
  const [u] = await db.select({ cohort: user.cohort }).from(user).where(eq(user.id, viewer.id)).limit(1);
  return u?.cohort ?? null;
}

/** For the issue board strip: the few proposals moving fastest right now. */
export async function trendingProposals(viewer: Viewer, n = 3) {
  return (await listProposals(viewer, { stage: "open" })).slice(0, n);
}

