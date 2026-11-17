"use server";

import { and, count, eq, gt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  attachments,
  categories,
  comments,
  flags,
  issueEvents,
  issues,
  issueVotes,
  issueWatchers,
  locations,
  notifications,
  user,
  verifications,
} from "@/db/schema";
import {
  ACTIVE_STATUSES,
  AUTO_HIDE_FLAGS,
  CLOSE_QUORUM,
  FLAG_REASONS,
  MAX_ISSUES_PER_DAY,
  MAX_PENDING_COMMENTS,
  MAX_PENDING_POSTS,
  MAX_PHOTOS,
  PENDING_NOTE,
  REOPEN_QUORUM,
  type Status,
} from "@/lib/constants";
import { canManage, isMod, isTrusted, requireViewer } from "../dal";
import { processImages } from "../images";
import { recountComments } from "../counts";
import { notifyWatchers, watch } from "../notify";
import { limit } from "../rate-limit";
import { run, UserError } from "../safe-action";

const uuid = z.string().uuid();
const clean = (s: string) => s.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();

/* ───────────────────────── Create ───────────────────────── */

const createSchema = z.object({
  title: z
    .string()
    .transform(clean)
    .pipe(z.string().min(8, "Give it a clearer title (at least 8 characters)").max(120, "Keep the title under 120 characters")),
  body: z.string().transform(clean).pipe(z.string().max(4000, "Description is too long")),
  categoryId: z.string().min(1, "Pick a category").max(40),
  locationId: z.string().max(40).optional().transform((v) => v || undefined),
  locationDetail: z
    .string()
    .max(80)
    .optional()
    .transform((v) => (v ? clean(v) : undefined)),
  severity: z.enum(["low", "medium", "high"]),
  anonymous: z.boolean(),
});

export async function createIssue(form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    const input = createSchema.parse({
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      categoryId: String(form.get("categoryId") ?? ""),
      locationId: String(form.get("locationId") ?? ""),
      locationDetail: String(form.get("locationDetail") ?? ""),
      severity: String(form.get("severity") ?? "medium"),
      anonymous: form.get("anonymous") === "true",
    });

    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_PHOTOS) throw new UserError(`Up to ${MAX_PHOTOS} photos`);

    const [{ n: today }] = await db
      .select({ n: count() })
      .from(issues)
      .where(and(eq(issues.reporterId, viewer.id), gt(issues.createdAt, sql`now() - interval '24 hours'`)));
    if (today >= MAX_ISSUES_PER_DAY) throw new UserError("You've reported a lot today. Try again tomorrow, or add a me-too to existing issues.");

    // Members' reports wait for a moderator. Offices, moderators and admins post directly.
    const trusted = isTrusted(viewer);
    if (!trusted) {
      const [{ n: waiting }] = await db.select({ n: count() }).from(issues).where(and(eq(issues.reporterId, viewer.id), eq(issues.approval, "pending")));
      if (waiting >= MAX_PENDING_POSTS) throw new UserError(`You have ${waiting} reports waiting for approval. Once a moderator has looked at them you can post more.`);
    }
    const [same] = await db
      .select({ number: issues.number })
      .from(issues)
      .where(and(eq(issues.reporterId, viewer.id), sql`lower(${issues.title}) = lower(${input.title})`, gt(issues.createdAt, sql`now() - interval '7 days'`)))
      .limit(1);
    if (same) throw new UserError(`You already reported this (#${same.number}).`);

    const [cat] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
    if (!cat) throw new UserError("Unknown category");
    if (input.locationId) {
      const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
      if (!loc) throw new UserError("Unknown location");
    }

    // Decode images before opening the transaction so a bad file fails fast.
    // Counted only once the post has passed every check, so a rejected attempt doesn't use up the allowance.
    await limit("createIssue", viewer.id);
    const photos = await processImages(files);

    const created = await db.transaction(async (tx) => {
      const [issue] = await tx
        .insert(issues)
        .values({
          title: input.title,
          body: input.body,
          categoryId: cat.id,
          locationId: input.locationId ?? null,
          locationDetail: input.locationDetail ?? null,
          severity: input.severity,
          anonymous: input.anonymous,
          reporterId: viewer.id,
          departmentId: cat.departmentId,
          dueAt: sql`now() + make_interval(hours => ${cat.slaHours})`,
          metooCount: 1,
          approval: trusted ? "approved" : "pending",
          hidden: !trusted,
          hiddenReason: trusted ? null : PENDING_NOTE,
        })
        .returning({ id: issues.id, number: issues.number });
      await tx.insert(issueVotes).values({ issueId: issue.id, userId: viewer.id });
      await watch(tx, issue.id, viewer.id);
      await tx.insert(issueEvents).values({
        issueId: issue.id,
        actorId: viewer.id,
        actorRole: viewer.role,
        type: "created",
        toStatus: "open",
        departmentId: cat.departmentId,
      });
      if (photos.length) {
        await tx.insert(attachments).values(photos.map((p) => ({ ...p, issueId: issue.id, uploaderId: viewer.id, kind: "report" as const })));
      }
      return issue;
    });

    revalidatePath("/board");
    revalidatePath("/admin");
    return { number: created.number, pending: !trusted };
  });
}

/* ───────────────────────── Me too ───────────────────────── */

export async function toggleMetoo(issueId: string) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    const id = uuid.parse(issueId);

    return db.transaction(async (tx) => {
      const [issue] = await tx
        .select({ id: issues.id, number: issues.number, status: issues.status, reporterId: issues.reporterId, hidden: issues.hidden })
        .from(issues)
        .where(eq(issues.id, id))
        .for("update")
        .limit(1);
      if (!issue || issue.hidden) throw new UserError("Issue not found");
      if (!ACTIVE_STATUSES.includes(issue.status as Status)) throw new UserError("This issue is closed.");

      const existing = await tx
        .select({ u: issueVotes.userId })
        .from(issueVotes)
        .where(and(eq(issueVotes.issueId, id), eq(issueVotes.userId, viewer.id)));

      let voted: boolean;
      if (existing.length) {
        if (issue.reporterId === viewer.id) throw new UserError("You reported this one — your vote stays.");
        await tx.delete(issueVotes).where(and(eq(issueVotes.issueId, id), eq(issueVotes.userId, viewer.id)));
        voted = false;
      } else {
        await tx.insert(issueVotes).values({ issueId: id, userId: viewer.id });
        await watch(tx, id, viewer.id);
        voted = true;
      }
      const [{ metooCount }] = await tx
        .update(issues)
        .set({ metooCount: sql`(select count(*) from issue_votes v where v.issue_id = ${id})::int` })
        .where(eq(issues.id, id))
        .returning({ metooCount: issues.metooCount });

      revalidatePath(`/issues/${issue.number}`);
      return { voted, metooCount };
    });
  });
}

/* ───────────────────────── Watch ───────────────────────── */

export async function toggleWatch(issueId: string) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    const id = uuid.parse(issueId);
    const del = await db
      .delete(issueWatchers)
      .where(and(eq(issueWatchers.issueId, id), eq(issueWatchers.userId, viewer.id)))
      .returning();
    if (del.length) return { watching: false };
    const [exists] = await db
      .select({ hidden: issues.hidden, departmentId: issues.departmentId, reporterId: issues.reporterId })
      .from(issues)
      .where(eq(issues.id, id))
      .limit(1);
    if (!exists || (exists.hidden && !isMod(viewer) && !canManage(viewer, exists.departmentId) && exists.reporterId !== viewer.id)) throw new UserError("Issue not found");
    await watch(db, id, viewer.id);
    return { watching: true };
  });
}

/* ───────────────────────── Comment ───────────────────────── */

const commentSchema = z.object({
  issueId: uuid,
  body: z.string().transform(clean).pipe(z.string().min(2, "Write something first").max(2000, "Keep comments under 2000 characters")),
  anonymous: z.boolean(),
  official: z.boolean(),
});

export async function addComment(input: z.input<typeof commentSchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("comment", viewer.id);
    const data = commentSchema.parse(input);

    const [issue] = await db
      .select({ id: issues.id, number: issues.number, departmentId: issues.departmentId, hidden: issues.hidden, title: issues.title })
      .from(issues)
      .where(eq(issues.id, data.issueId))
      .limit(1);
    if (!issue) throw new UserError("Issue not found");
    if (issue.hidden && !canManage(viewer, issue.departmentId)) throw new UserError("Issue not found");

    const official = data.official && canManage(viewer, issue.departmentId);
    if (data.official && !official) throw new UserError("Only the assigned department can post official updates.");

    // Comments from members wait for a moderator too; nobody is notified until one is approved.
    const live = official || isTrusted(viewer);
    if (!live) {
      const [{ n: waiting }] = await db.select({ n: count() }).from(comments).where(and(eq(comments.authorId, viewer.id), eq(comments.approval, "pending")));
      if (waiting >= MAX_PENDING_COMMENTS) throw new UserError("You have several comments waiting for approval. Give the moderators a moment.");
    }
    const [dupe] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.issueId, issue.id), eq(comments.authorId, viewer.id), eq(comments.body, data.body), gt(comments.createdAt, sql`now() - interval '1 hour'`)))
      .limit(1);
    if (dupe) throw new UserError("You already posted that here.");

    await db.transaction(async (tx) => {
      await tx.insert(comments).values({
        issueId: issue.id,
        authorId: viewer.id,
        body: data.body,
        anonymous: official ? false : data.anonymous,
        official,
        departmentId: official && viewer.role === "staff" ? viewer.departmentId : null,
        hidden: !live,
        approval: live ? "approved" : "pending",
      });
      await watch(tx, issue.id, viewer.id);
      if (!live) return;
      await tx
        .update(issues)
        .set({ commentCount: sql`${issues.commentCount} + 1`, updatedAt: sql`now()` })
        .where(eq(issues.id, issue.id));
      await notifyWatchers(
        tx,
        issue.id,
        viewer.id,
        official ? "official" : "comment",
        official ? `Official update on #${issue.number}: ${truncate(data.body, 90)}` : `New comment on #${issue.number} ${truncate(issue.title, 60)}`,
      );
    });
    revalidatePath(`/issues/${issue.number}`);
    revalidatePath("/admin");
    return { pending: !live };
  });
}

/* ───────────────────────── Verify fix ───────────────────────── */

const verifySchema = z.object({
  issueId: uuid,
  fixed: z.boolean(),
  note: z
    .string()
    .max(500)
    .optional()
    .transform((v) => (v ? clean(v) : undefined)),
});

export async function verifyFix(input: z.input<typeof verifySchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    const data = verifySchema.parse(input);
    if (!data.fixed && (!data.note || data.note.length < 5)) throw new UserError("Tell the department what's still wrong.");

    const outcome = await db.transaction(async (tx) => {
      const [issue] = await tx.select().from(issues).where(eq(issues.id, data.issueId)).for("update").limit(1);
      if (!issue || issue.hidden) throw new UserError("Issue not found");
      if (issue.status !== "resolved") throw new UserError("This issue isn't awaiting confirmation.");

      // Only people who were affected before it was marked fixed can answer; a me-too added
      // afterwards (or a second account) can't swing the result.
      const [voted] = await tx
        .select({ u: issueVotes.userId })
        .from(issueVotes)
        .where(and(eq(issueVotes.issueId, issue.id), eq(issueVotes.userId, viewer.id), issue.resolvedAt ? sql`${issueVotes.createdAt} <= ${issue.resolvedAt}` : sql`true`));
      if (!voted) throw new UserError("Only people who reported or me-too'd this before it was marked fixed can confirm it.");

      const inserted = await tx
        .insert(verifications)
        .values({ issueId: issue.id, userId: viewer.id, round: issue.reopenCount, fixed: data.fixed, note: data.note })
        .onConflictDoNothing()
        .returning();
      if (!inserted.length) throw new UserError("You've already answered.");

      // Answers count only while the person is still counted as affected.
      const tally = await tx
        .select({ fixed: verifications.fixed, n: count() })
        .from(verifications)
        .where(
          and(
            eq(verifications.issueId, issue.id),
            eq(verifications.round, issue.reopenCount),
            sql`exists (select 1 from issue_votes v where v.issue_id = ${issue.id} and v.user_id = ${verifications.userId})`,
          ),
        )
        .groupBy(verifications.fixed);
      const fixedN = tally.find((t) => t.fixed)?.n ?? 0;
      const brokenN = tally.find((t) => !t.fixed)?.n ?? 0;
      const isReporter = issue.reporterId === viewer.id;
      // A quorum can't exceed the number of people who actually reported it.
      const reopenQuorum = Math.min(REOPEN_QUORUM, issue.metooCount);
      const closeQuorum = Math.min(CLOSE_QUORUM, issue.metooCount);

      if (!data.fixed && (isReporter || brokenN >= reopenQuorum)) {
        await tx
          .update(issues)
          .set({
            status: "in_progress",
            resolvedAt: null,
            reopenCount: sql`${issues.reopenCount} + 1`,
            updatedAt: sql`now()`,
            // A reopened issue gets a fresh target rather than being instantly overdue.
            dueAt: sql`now() + make_interval(hours => (select sla_hours from categories c where c.id = ${issues.categoryId}))`,
          })
          .where(eq(issues.id, issue.id));
        await tx.insert(issueEvents).values({
          issueId: issue.id,
          actorId: viewer.id,
          actorRole: "member", // verification is a reporter action, never shown as a department
          type: "reopened",
          fromStatus: "resolved",
          toStatus: "in_progress",
          // The note is unreviewed member text: it stays on the verification row for the office, not on the public timeline.
          note: null,
        });
        await notifyWatchers(tx, issue.id, viewer.id, "status", `#${issue.number} was reopened — reporters say it's still not fixed.`);
        return "reopened";
      }
      if (data.fixed && (isReporter || fixedN >= closeQuorum)) {
        await tx
          .update(issues)
          .set({ status: "closed", closedAt: sql`now()`, updatedAt: sql`now()` })
          .where(eq(issues.id, issue.id));
        await tx.insert(issueEvents).values({
          issueId: issue.id,
          actorId: viewer.id,
          actorRole: "member",
          type: "verified",
          fromStatus: "resolved",
          toStatus: "closed",
          note: null,
        });
        await notifyWatchers(tx, issue.id, viewer.id, "status", `#${issue.number} is verified fixed by the people who reported it.`);
        return "closed";
      }
      return "recorded";
    });
    revalidatePath("/board");
    return { outcome };
  });
}

/* ───────────────────────── Flag ───────────────────────── */

const flagSchema = z.object({
  targetType: z.enum(["issue", "comment"]),
  targetId: uuid,
  reason: z.enum(FLAG_REASONS),
});

export async function flagContent(input: z.input<typeof flagSchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("flag", viewer.id);
    const data = flagSchema.parse(input);

    let issueId: string;
    // Content from an office, a moderator or an admin is never auto-hidden; flags still reach the queue.
    let protectedPost = false;
    if (data.targetType === "issue") {
      const [i] = await db
        .select({ id: issues.id, hidden: issues.hidden, approval: issues.approval, role: user.role })
        .from(issues)
        .innerJoin(user, eq(user.id, issues.reporterId))
        .where(eq(issues.id, data.targetId))
        .limit(1);
      if (!i || i.hidden || i.approval !== "approved") throw new UserError("Not found");
      issueId = i.id;
      protectedPost = i.role !== "member";
    } else {
      const [c] = await db
        .select({ issueId: comments.issueId, hidden: comments.hidden, approval: comments.approval, official: comments.official, role: user.role, issueHidden: issues.hidden })
        .from(comments)
        .innerJoin(user, eq(user.id, comments.authorId))
        .innerJoin(issues, eq(issues.id, comments.issueId))
        .where(eq(comments.id, data.targetId))
        .limit(1);
      if (!c || c.hidden || c.issueHidden || c.approval !== "approved") throw new UserError("Not found");
      issueId = c.issueId;
      protectedPost = c.official || c.role !== "member";
    }

    await db.transaction(async (tx) => {
      // Lock the target so two flags arriving together are counted one after the other.
      if (data.targetType === "issue") await tx.select({ id: issues.id }).from(issues).where(eq(issues.id, data.targetId)).for("update");
      else await tx.select({ id: comments.id }).from(comments).where(eq(comments.id, data.targetId)).for("update");
      await tx
        .insert(flags)
        .values({ targetType: data.targetType, targetId: data.targetId, issueId, userId: viewer.id, reason: data.reason })
        .onConflictDoNothing();
      const [{ n }] = await tx
        .select({ n: count() })
        .from(flags)
        .where(and(eq(flags.targetType, data.targetType), eq(flags.targetId, data.targetId), eq(flags.resolved, false)));
      if (n >= AUTO_HIDE_FLAGS && !protectedPost) {
        if (data.targetType === "issue") {
          await tx
            .update(issues)
            .set({ hidden: true, hiddenReason: "Auto-hidden after community flags — pending admin review", updatedAt: sql`now()` })
            .where(and(eq(issues.id, data.targetId), eq(issues.hidden, false)));
        } else {
          await tx.update(comments).set({ hidden: true }).where(eq(comments.id, data.targetId));
          await recountComments(tx, issueId);
        }
      }
    });
    return {};
  });
}

/* ───────────────────────── Notifications ───────────────────────── */

export async function markAllRead() {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(and(eq(notifications.userId, viewer.id), sql`${notifications.readAt} is null`));
    revalidatePath("/", "layout");
    return {};
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
