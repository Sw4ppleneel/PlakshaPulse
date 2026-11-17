"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  attachments,
  auditLog,
  comments,
  departments,
  flags,
  issueEvents,
  issues,
  notifications,
  proposalPosts,
  proposals,
  proposalSupports,
  session,
  user,
} from "@/db/schema";
import { ACTIVE_STATUSES, MAX_PHOTOS, STATUS_META, STATUSES, TRANSITIONS, type Status } from "@/lib/constants";
import { AuthError, canManage, requireAdmin, requireMod, requireViewer } from "../dal";
import { recountComments } from "../counts";
import { processImages } from "../images";
import { notifyWatchers } from "../notify";
import { limit } from "../rate-limit";
import { run, UserError } from "../safe-action";

const uuid = z.string().uuid();
const clean = (s: string) => s.replace(/\u0000/g, "").trim();

/* ───────────────────────── Status ───────────────────────── */

export async function updateStatus(form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("admin", viewer.id);
    const issueId = uuid.parse(form.get("issueId"));
    const to = z.enum(STATUSES).parse(form.get("to"));
    const note = clean(String(form.get("note") ?? "")).slice(0, 2000);
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_PHOTOS) throw new UserError(`Up to ${MAX_PHOTOS} photos`);

    const [current] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!current) throw new UserError("Issue not found");
    if (!canManage(viewer, current.departmentId)) throw new AuthError("Only the assigned department or an admin can change this.", 403);
    if (current.approval !== "approved") throw new UserError("Approve this report from the moderation queue first.");
    if (to === "duplicate") throw new UserError("Use merge to mark duplicates.");
    if (!TRANSITIONS[current.status].includes(to)) {
      throw new UserError(`Can't move from ${STATUS_META[current.status].label} to ${STATUS_META[to].label}.`);
    }
    if (to === "closed" && viewer.role !== "admin") throw new UserError("Only admins can close without reporter confirmation.");
    if (to === "resolved" && note.length < 10) throw new UserError("Say what was done — reporters will check it (10+ characters).");
    if (to === "wont_fix" && note.length < 10) throw new UserError("Give a public reason for not fixing this (10+ characters).");

    const photos = await processImages(files);

    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: issues.status }).from(issues).where(eq(issues.id, issueId)).for("update");
      if (locked.status !== current.status) throw new UserError("Someone else just updated this issue. Refresh and try again.");

      const patch: Record<string, unknown> = { status: to, updatedAt: sql`now()` };
      if (to === "acknowledged" || (to === "in_progress" && !current.acknowledgedAt)) patch.acknowledgedAt = sql`now()`;
      if (to === "resolved") {
        patch.resolvedAt = sql`now()`;
        patch.resolutionNote = note;
      }
      if (to === "closed") patch.closedAt = sql`now()`;
      if (to === "wont_fix") {
        patch.wontFixReason = note;
        patch.closedAt = sql`now()`;
      }
      const reopening = (current.status === "resolved" || current.status === "closed") && to === "in_progress";
      if (reopening) {
        patch.resolvedAt = null;
        patch.closedAt = null;
        patch.reopenCount = sql`${issues.reopenCount} + 1`;
      }
      // Anything going back to work gets a fresh target time instead of being instantly overdue.
      if (reopening || ((current.status === "wont_fix" || current.status === "duplicate") && to === "open")) {
        patch.dueAt = sql`now() + make_interval(hours => (select sla_hours from categories c where c.id = ${issues.categoryId}))`;
      }
      if (current.status === "wont_fix" || current.status === "duplicate") {
        patch.closedAt = null;
        patch.duplicateOfId = null;
      }
      await tx.update(issues).set(patch).where(eq(issues.id, issueId));
      await tx.insert(issueEvents).values({
        issueId,
        actorId: viewer.id,
        actorRole: viewer.role,
        type: reopening ? "reopened" : "status_changed",
        fromStatus: current.status,
        toStatus: to,
        departmentId: current.departmentId,
        note: note || null,
      });
      if (photos.length) {
        await tx.insert(attachments).values(photos.map((p) => ({ ...p, issueId, uploaderId: viewer.id, kind: "resolution" as const })));
      }
      const msg =
        to === "resolved"
          ? `#${current.number} was marked fixed. Is it actually fixed? Let them know.`
          : `#${current.number} is now ${STATUS_META[to].label.toLowerCase()}.`;
      await notifyWatchers(tx, issueId, viewer.id, to === "resolved" ? "verify" : "status", msg);
    });

    revalidatePath(`/issues/${current.number}`);
    revalidatePath("/board");
    return {};
  });
}

/* ───────────────────────── Reassign ───────────────────────── */

export async function reassignIssue(input: { issueId: string; departmentId: string; note?: string }) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("admin", viewer.id);
    const issueId = uuid.parse(input.issueId);
    const departmentId = z.string().min(1).max(40).parse(input.departmentId);
    const note = clean(input.note ?? "").slice(0, 500);

    const [current] = await db.select().from(issues).where(eq(issues.id, issueId)).limit(1);
    if (!current) throw new UserError("Issue not found");
    if (!canManage(viewer, current.departmentId)) throw new AuthError("Not allowed", 403);
    if (current.approval !== "approved") throw new UserError("Approve this report from the moderation queue first.");
    if (current.departmentId === departmentId) return {};
    const [dept] = await db.select().from(departments).where(eq(departments.id, departmentId)).limit(1);
    if (!dept) throw new UserError("Unknown department");

    await db.transaction(async (tx) => {
      await tx.update(issues).set({ departmentId, updatedAt: sql`now()` }).where(eq(issues.id, issueId));
      await tx.insert(issueEvents).values({
        issueId,
        actorId: viewer.id,
        actorRole: viewer.role,
        type: "reassigned",
        departmentId,
        note: note ? `Routed to ${dept.name}: ${note}` : `Routed to ${dept.name}`,
      });
      await notifyWatchers(tx, issueId, viewer.id, "status", `#${current.number} was routed to ${dept.name}.`);
    });
    revalidatePath(`/issues/${current.number}`);
    return {};
  });
}

/* ───────────────────────── Merge duplicates ───────────────────────── */

export async function mergeIssue(input: { issueId: string; targetNumber: number }) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("admin", viewer.id);
    const issueId = uuid.parse(input.issueId);
    const targetNumber = z.coerce.number().int().positive().max(2_147_483_647, "Issue not found").parse(input.targetNumber);

    const targetNumber_ = targetNumber;
    const [first] = await db.select({ id: issues.id }).from(issues).where(eq(issues.id, issueId)).limit(1);
    const [second] = await db.select({ id: issues.id }).from(issues).where(eq(issues.number, targetNumber_)).limit(1);
    // Same answer whether the target is missing, hidden or waiting for approval: nothing to learn here.
    if (!first || !second) throw new UserError("Issue not found");

    let source!: typeof issues.$inferSelect;
    let target!: typeof issues.$inferSelect;
    await db.transaction(async (tx) => {
      // Lock both rows in a fixed order, so A→B and B→A at the same moment can't both succeed.
      const rows = await tx
        .select()
        .from(issues)
        .where(sql`${issues.id} in (${first.id}, ${second.id})`)
        .orderBy(issues.id)
        .for("update");
      source = rows.find((r) => r.id === first.id)!;
      target = rows.find((r) => r.id === second.id)!;
      if (!source || !target) throw new UserError("Issue not found");
      if (!canManage(viewer, source.departmentId)) throw new AuthError("Not allowed", 403);
      if (target.hidden || target.approval !== "approved") throw new UserError("Issue not found");
      if (source.hidden || source.approval !== "approved") throw new UserError("Approve or restore this report before merging it.");
      if (source.id === target.id) throw new UserError("Can't merge an issue into itself.");
      if (!ACTIVE_STATUSES.includes(target.status as Status)) throw new UserError(`#${target.number} is closed — reopen it first or merge the other way.`);
      if (source.status === "duplicate") throw new UserError("Already merged.");
      if (target.status === "duplicate") throw new UserError(`#${target.number} is itself merged into another issue.`);

      // Everyone who said "me too" on the duplicate now counts toward the surviving issue.
      await tx.execute(sql`
        insert into issue_votes (issue_id, user_id, created_at)
        select ${target.id}, user_id, created_at from issue_votes where issue_id = ${source.id}
        on conflict do nothing`);
      await tx.execute(sql`
        insert into issue_watchers (issue_id, user_id)
        select ${target.id}, user_id from issue_watchers where issue_id = ${source.id}
        on conflict do nothing`);
      await tx
        .update(issues)
        .set({ metooCount: sql`(select count(*) from issue_votes v where v.issue_id = ${target.id})::int`, updatedAt: sql`now()` })
        .where(eq(issues.id, target.id));
      await tx
        .update(issues)
        .set({ status: "duplicate", duplicateOfId: target.id, closedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(issues.id, source.id));
      await tx.insert(issueEvents).values([
        {
          issueId: source.id,
          actorId: viewer.id,
          actorRole: viewer.role,
          type: "merged_away",
          fromStatus: source.status,
          toStatus: "duplicate",
          relatedIssueId: target.id,
          departmentId: source.departmentId,
        },
        {
          issueId: target.id,
          actorId: viewer.id,
          actorRole: viewer.role,
          type: "merged_in",
          relatedIssueId: source.id,
          departmentId: target.departmentId,
        },
      ]);
      await notifyWatchers(tx, source.id, viewer.id, "merged", `#${source.number} was merged into #${target.number}. Your me-too moved with it.`);
    });
    revalidatePath(`/issues/${source.number}`);
    revalidatePath(`/issues/${target.number}`);
    return { targetNumber: target.number };
  });
}

/* ───────────────────────── Moderation (moderators and admins) ───────────────────────── */

const moderateSchema = z.object({
  targetType: z.enum(["issue", "comment"]),
  targetId: uuid,
  hide: z.boolean(),
  reason: z.string().max(300).optional(),
});

export async function moderate(input: z.input<typeof moderateSchema>) {
  return run(async () => {
    const admin = await requireMod();
    await limit("admin", admin.id);
    const { targetType, targetId, hide, reason: rawReason } = moderateSchema.parse(input);
    const reason = clean(rawReason ?? "").slice(0, 300) || null;

    let number: number | undefined;
    await db.transaction(async (tx) => {
      if (targetType === "issue") {
        const [before] = await tx.select().from(issues).where(eq(issues.id, targetId)).for("update").limit(1);
        if (!before) throw new UserError("Not found");
        // Restoring something that never went public (pending or rejected) is an approval: the
        // office's clock starts now and the author hears about it.
        const firstPublic = !hide && before.approval !== "approved";
        await tx
          .update(issues)
          .set({
            hidden: hide,
            hiddenReason: hide ? reason : null,
            updatedAt: sql`now()`,
            ...(hide ? {} : { approval: "approved" as const }),
            ...(firstPublic ? { dueAt: sql`now() + make_interval(hours => (select sla_hours from categories c where c.id = ${issues.categoryId}))` } : {}),
          })
          .where(eq(issues.id, targetId));
        number = before.number;
        await tx.insert(issueEvents).values({
          issueId: targetId,
          actorId: admin.id,
          actorRole: admin.role,
          type: hide ? "hidden" : "restored",
          note: reason,
        });
        if (firstPublic) {
          await tx.insert(notifications).values({ userId: before.reporterId, issueId: targetId, kind: "review", message: `Your report #${before.number} is approved and live on the board.` });
        }
      } else {
        const [before] = await tx.select().from(comments).where(eq(comments.id, targetId)).for("update").limit(1);
        if (!before) throw new UserError("Not found");
        await tx
          .update(comments)
          .set({ hidden: hide, ...(hide ? {} : { approval: "approved" as const }) })
          .where(eq(comments.id, targetId));
        await recountComments(tx, before.issueId);
        const [i] = await tx.select({ number: issues.number }).from(issues).where(eq(issues.id, before.issueId));
        number = i?.number;
      }
      await tx
        .update(flags)
        .set({ resolved: true })
        .where(and(eq(flags.targetType, targetType), eq(flags.targetId, targetId)));
      await tx.insert(auditLog).values({
        actorId: admin.id,
        action: hide ? "hide" : "restore",
        targetType,
        targetId,
        detail: reason,
      });
    });
    if (number) revalidatePath(`/issues/${number}`);
    revalidatePath("/admin");
    revalidatePath("/board");
    return {};
  });
}

export async function dismissFlags(input: { targetType: "issue" | "comment"; targetId: string }) {
  return run(async () => {
    const admin = await requireMod();
    const targetType = z.enum(["issue", "comment"]).parse(input.targetType);
    const targetId = uuid.parse(input.targetId);
    await db.update(flags).set({ resolved: true }).where(and(eq(flags.targetType, targetType), eq(flags.targetId, targetId)));
    await db.insert(auditLog).values({ actorId: admin.id, action: "dismiss_flags", targetType, targetId });
    revalidatePath("/admin");
    return {};
  });
}

/* ───────────────────────── People (admin) ───────────────────────── */

export async function setUserRole(input: { userId: string; role: "member" | "staff" | "mod" | "admin"; departmentId?: string | null }) {
  return run(async () => {
    const admin = await requireAdmin();
    await limit("admin", admin.id);
    const userId = z.string().min(1).max(64).parse(input.userId);
    const role = z.enum(["member", "staff", "mod", "admin"]).parse(input.role);
    if (userId === admin.id && role !== "admin") throw new UserError("You can't remove your own admin role.");
    let departmentId: string | null = null;
    if (role === "staff") {
      departmentId = z.string().min(1, "Staff need a department").parse(input.departmentId ?? "");
      const [d] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId));
      if (!d) throw new UserError("Unknown department");
    }
    const [u] = await db.update(user).set({ role, departmentId, updatedAt: sql`now()` }).where(eq(user.id, userId)).returning();
    if (!u) throw new UserError("User not found");
    await db.insert(auditLog).values({
      actorId: admin.id,
      action: "set_role",
      targetType: "user",
      targetId: userId,
      detail: `${role}${departmentId ? `:${departmentId}` : ""}`,
    });
    revalidatePath("/admin/people");
    return {};
  });
}

export async function setBanned(input: { userId: string; banned: boolean; reason?: string }) {
  return run(async () => {
    const admin = await requireAdmin();
    await limit("admin", admin.id);
    const userId = z.string().min(1).max(64).parse(input.userId);
    const banned = z.boolean().parse(input.banned);
    if (userId === admin.id) throw new UserError("You can't suspend yourself.");
    const reason = clean(z.string().max(300).optional().parse(input.reason) ?? "").slice(0, 300) || null;
    await db.transaction(async (tx) => {
      const [u] = await tx
        .update(user)
        .set({ banned, bannedReason: banned ? reason : null, updatedAt: sql`now()` })
        .where(and(eq(user.id, userId), ne(user.role, "admin")))
        .returning();
      if (!u) throw new UserError("User not found (admins can't be suspended — demote first).");
      if (banned) {
        await tx.delete(session).where(eq(session.userId, userId)); // sign them out everywhere
        // Nothing they left waiting in the approval queue goes public.
        await tx.update(issues).set({ approval: "rejected", hiddenReason: "Author suspended" }).where(and(eq(issues.reporterId, userId), eq(issues.approval, "pending")));
        await tx.update(proposals).set({ approval: "rejected", hiddenReason: "Author suspended" }).where(and(eq(proposals.authorId, userId), eq(proposals.approval, "pending")));
        await tx.update(comments).set({ approval: "rejected" }).where(and(eq(comments.authorId, userId), eq(comments.approval, "pending")));
        await tx.update(proposalPosts).set({ approval: "rejected" }).where(and(eq(proposalPosts.authorId, userId), eq(proposalPosts.approval, "pending")));
        await tx.update(proposalSupports).set({ reasonApproval: "rejected" }).where(and(eq(proposalSupports.userId, userId), eq(proposalSupports.reasonApproval, "pending")));
      }
      await tx.insert(auditLog).values({
        actorId: admin.id,
        action: input.banned ? "ban" : "unban",
        targetType: "user",
        targetId: userId,
        detail: reason,
      });
    });
    revalidatePath("/admin/people");
    return {};
  });
}

