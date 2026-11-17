"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, categories, comments, issues, notifications, proposalPosts, proposals, proposalSupports } from "@/db/schema";
import { requireMod } from "../dal";
import { notifyWatchers } from "../notify";
import { limit } from "../rate-limit";
import { run, UserError } from "../safe-action";

const schema = z.object({
  kind: z.enum(["issue", "proposal", "comment", "post", "reason"]),
  /** A row id; for `reason` it is "<proposalId>:<userId>". */
  id: z.string().min(1).max(120),
  approve: z.boolean(),
  note: z
    .string()
    .max(300)
    .optional()
    .transform((v) => v?.replace(/\u0000/g, "").trim() || null),
});

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const why = (note: string | null) => (note ? ` Reason: ${note}` : "");

/**
 * A moderator's decision on something a member posted. Approving makes it public and sends the
 * notifications that were held back; rejecting keeps it visible only to its author, with the reason.
 * Only rows still `pending` can be decided, so two moderators can't both act on one item.
 */
export async function reviewContent(input: z.input<typeof schema>) {
  return run(async () => {
    const mod = await requireMod();
    await limit("admin", mod.id);
    const { kind, id, approve, note } = schema.parse(input);
    const approval = approve ? ("approved" as const) : ("rejected" as const);
    const uuid = (v: string) => z.string().uuid().parse(v);
    const gone = () => new UserError("Someone already reviewed this.");

    await db.transaction(async (tx) => {
      if (kind === "issue") {
        const [i] = await tx
          .update(issues)
          .set({
            approval,
            hidden: !approve,
            hiddenReason: approve ? null : (note ?? "Not approved by a moderator"),
            // The office's clock starts when the report becomes public, not while it sat in the queue.
            ...(approve ? { dueAt: sql`now() + make_interval(hours => (select sla_hours from ${categories} where ${categories.id} = ${issues.categoryId}))` } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(issues.id, uuid(id)), eq(issues.approval, "pending")))
          .returning({ id: issues.id, number: issues.number, title: issues.title, authorId: issues.reporterId });
        if (!i) throw gone();
        await tx.insert(notifications).values({
          userId: i.authorId,
          issueId: i.id,
          kind: "review",
          message: approve ? `Your report #${i.number} is approved and live on the board.` : `Your report “${cut(i.title, 50)}” wasn't approved.${why(note)}`,
        });
        revalidatePath(`/issues/${i.number}`);
        revalidatePath("/board");
      } else if (kind === "proposal") {
        const [p] = await tx
          .update(proposals)
          .set({ approval, hidden: !approve, hiddenReason: approve ? null : (note ?? "Not approved by a moderator"), updatedAt: new Date() })
          .where(and(eq(proposals.id, uuid(id)), eq(proposals.approval, "pending")))
          .returning({ id: proposals.id, number: proposals.number, title: proposals.title, authorId: proposals.authorId });
        if (!p) throw gone();
        await tx.insert(notifications).values({
          userId: p.authorId,
          proposalId: p.id,
          kind: "review",
          message: approve ? `“${cut(p.title, 50)}” is approved and live. Share it to start collecting support.` : `Your proposal “${cut(p.title, 50)}” wasn't approved.${why(note)}`,
        });
        revalidatePath(`/proposals/${p.number}`);
        revalidatePath("/proposals");
      } else if (kind === "comment") {
        const [c] = await tx
          .update(comments)
          .set({ approval, hidden: !approve })
          .where(and(eq(comments.id, uuid(id)), eq(comments.approval, "pending")))
          .returning({ issueId: comments.issueId, authorId: comments.authorId, body: comments.body });
        if (!c) throw gone();
        const [i] = await tx
          .update(issues)
          .set({ commentCount: sql`(select count(*) from ${comments} where ${comments.issueId} = ${c.issueId} and not ${comments.hidden})::int` })
          .where(eq(issues.id, c.issueId))
          .returning({ number: issues.number, title: issues.title });
        if (approve) await notifyWatchers(tx, c.issueId, c.authorId, "comment", `New comment on #${i!.number} ${cut(i!.title, 60)}`);
        else await tx.insert(notifications).values({ userId: c.authorId, issueId: c.issueId, kind: "review", message: `Your comment on #${i!.number} wasn't approved.${why(note)}` });
        revalidatePath(`/issues/${i!.number}`);
      } else if (kind === "post") {
        const [post] = await tx
          .update(proposalPosts)
          .set({ approval, hidden: !approve })
          .where(and(eq(proposalPosts.id, uuid(id)), eq(proposalPosts.approval, "pending")))
          .returning({ proposalId: proposalPosts.proposalId, authorId: proposalPosts.authorId, kind: proposalPosts.kind, body: proposalPosts.body });
        if (!post) throw gone();
        const [p] = await tx
          .update(proposals)
          .set({ commentCount: sql`(select count(*) from ${proposalPosts} x where x.proposal_id = ${post.proposalId} and x.kind = 'comment' and not x.hidden)::int` })
          .where(eq(proposals.id, post.proposalId))
          .returning({ number: proposals.number, title: proposals.title });
        if (approve && post.kind === "update") {
          const supporters = await tx.select({ userId: proposalSupports.userId }).from(proposalSupports).where(eq(proposalSupports.proposalId, post.proposalId));
          const to = supporters.filter((s) => s.userId !== post.authorId);
          if (to.length) await tx.insert(notifications).values(to.map((s) => ({ userId: s.userId, proposalId: post.proposalId, kind: "update", message: `Update on “${cut(p!.title, 50)}”: ${cut(post.body ?? "", 90)}` })));
        }
        if (!approve && post.authorId) {
          await tx.insert(notifications).values({ userId: post.authorId, proposalId: post.proposalId, kind: "review", message: `Your post on “${cut(p!.title, 50)}” wasn't approved.${why(note)}` });
        }
        revalidatePath(`/proposals/${p!.number}`);
      } else {
        const [proposalId, userId] = id.split(":");
        const [s] = await tx
          .update(proposalSupports)
          .set({ reasonApproval: approval })
          .where(and(eq(proposalSupports.proposalId, uuid(proposalId ?? "")), eq(proposalSupports.userId, userId ?? ""), eq(proposalSupports.reasonApproval, "pending")))
          .returning({ proposalId: proposalSupports.proposalId });
        if (!s) throw gone();
        const [p] = await tx.select({ number: proposals.number }).from(proposals).where(eq(proposals.id, s.proposalId));
        revalidatePath(`/proposals/${p!.number}`);
      }
      await tx.insert(auditLog).values({ actorId: mod.id, action: approve ? "approve" : "reject", targetType: kind, targetId: id, detail: note });
    });
    revalidatePath("/admin");
    return {};
  });
}
