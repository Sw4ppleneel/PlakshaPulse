"use server";

import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { attachments, auditLog, departments, notifications, proposalPosts, proposals, proposalSupports, trialCheckins, user, type ProposalStage } from "@/db/schema";
import { AREAS, AUTHOR_MOVES, COHORTS, DEFAULT_GOAL, MAX_PENDING_COMMENTS, MAX_PENDING_POSTS, MAX_PHOTOS, MAX_PROPOSALS_PER_DAY, PENDING_NOTE, OPEN_STAGES, STAGE_META, STAGE_MOVES, STAGES } from "@/lib/constants";
import { canManage, isMod, isTrusted, requireMod, requireViewer, type Viewer } from "../dal";
import { processImages } from "../images";
import { campusDay } from "../proposal-queries";
import { limit } from "../rate-limit";
import { run, UserError } from "../safe-action";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const uuid = z.string().uuid();
const clean = (s: string) => s.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
const text = (min: number, max: number, tooShort: string, tooLong: string) =>
  z.string().transform(clean).pipe(z.string().min(min, tooShort).max(max, tooLong));
/** A real calendar date (rejects 2026-02-30 and 2026-13-45), within a sane range. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2024-01-01" && v <= "2100-01-01";
  }, "Use a valid date")
  .optional()
  .or(z.literal("").transform(() => undefined));
/** The batch list people pick from; free text here would be unreviewed public text. */
const cohort = z.enum(COHORTS, { message: "Pick your batch or group from the list" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** Supporters are the audience for every proposal update — they asked for it. */
async function notifySupporters(tx: Tx | typeof db, proposalId: string, actorId: string | null, kind: string, message: string) {
  const rows = await tx
    .select({ userId: proposalSupports.userId })
    .from(proposalSupports)
    .where(actorId ? and(eq(proposalSupports.proposalId, proposalId), ne(proposalSupports.userId, actorId)) : eq(proposalSupports.proposalId, proposalId));
  if (!rows.length) return;
  await tx.insert(notifications).values(rows.map((r) => ({ userId: r.userId, proposalId, kind, message })));
}

async function loadForUpdate(tx: Tx, id: string) {
  const [p] = await tx.select().from(proposals).where(eq(proposals.id, id)).for("update").limit(1);
  if (!p) throw new UserError("Proposal not found");
  return p;
}

const mayDecide = (v: Viewer, departmentId: string | null) => v.role === "admin" || (!!departmentId && canManage(v, departmentId));

/* ───────────────────────── Create ───────────────────────── */

const createSchema = z.object({
  title: text(8, 100, "Give it a clearer title (at least 8 characters)", "Keep the title under 100 characters"),
  ask: text(15, 280, "Say what exactly you're asking for (at least 15 characters)", "Keep the ask under 280 characters"),
  body: z.string().transform(clean).pipe(z.string().max(5000, "That's too long — keep it under 5000 characters")),
  area: z.enum(AREAS.map((a) => a.id) as [string, ...string[]], { message: "Pick an area" }),
  departmentId: z.string().max(40).optional().transform((v) => v || undefined),
  goal: z.coerce.number().int().min(10, "Set a goal of at least 10 people").max(2000, "Goals above 2000 aren't realistic here"),
  trialPlan: z.string().transform(clean).pipe(z.string().max(1000, "Keep the trial idea under 1000 characters")),
  cohort: cohort.optional(),
});

export async function createProposal(form: FormData) {
  return run(async () => {
    const viewer = await requireViewer();
    const input = createSchema.parse({
      title: String(form.get("title") ?? ""),
      ask: String(form.get("ask") ?? ""),
      body: String(form.get("body") ?? ""),
      area: String(form.get("area") ?? ""),
      departmentId: String(form.get("departmentId") ?? ""),
      goal: String(form.get("goal") || DEFAULT_GOAL),
      trialPlan: String(form.get("trialPlan") ?? ""),
      cohort: String(form.get("cohort") ?? "") || undefined,
    });

    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_PHOTOS) throw new UserError(`Up to ${MAX_PHOTOS} photos`);

    const [{ n: today }] = await db
      .select({ n: count() })
      .from(proposals)
      .where(and(eq(proposals.authorId, viewer.id), gt(proposals.createdAt, sql`now() - interval '24 hours'`)));
    if (today >= MAX_PROPOSALS_PER_DAY) throw new UserError("That's a lot of proposals for one day — back someone else's, or try tomorrow.");
    if (input.departmentId) {
      const [d] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId)).limit(1);
      if (!d) throw new UserError("Unknown office");
    }
    // Members' proposals wait for a moderator. Offices, moderators and admins post directly.
    const trusted = isTrusted(viewer);
    if (!trusted) {
      const [{ n: waiting }] = await db.select({ n: count() }).from(proposals).where(and(eq(proposals.authorId, viewer.id), eq(proposals.approval, "pending")));
      if (waiting >= MAX_PENDING_POSTS) throw new UserError(`You have ${waiting} proposals waiting for approval. Once a moderator has looked at them you can post more.`);
    }
    const [same] = await db
      .select({ number: proposals.number })
      .from(proposals)
      .where(and(eq(proposals.authorId, viewer.id), sql`lower(${proposals.title}) = lower(${input.title})`))
      .limit(1);
    if (same) throw new UserError(`You already proposed this (P-${same.number}).`);

    // Decode images before opening the transaction so a bad file fails fast.
    // Counted only once the post has passed every check, so a rejected attempt doesn't use up the allowance.
    await limit("createProposal", viewer.id);
    const photos = await processImages(files);

    const created = await db.transaction(async (tx) => {
      if (input.cohort) await tx.update(user).set({ cohort: input.cohort }).where(eq(user.id, viewer.id));
      const [{ cohort }] = await tx.select({ cohort: user.cohort }).from(user).where(eq(user.id, viewer.id));
      const [p] = await tx
        .insert(proposals)
        .values({
          title: input.title,
          ask: input.ask,
          body: input.body,
          area: input.area,
          departmentId: input.departmentId ?? null,
          goal: input.goal,
          trialPlan: input.trialPlan || null,
          authorId: viewer.id,
          supportCount: 1,
          approval: trusted ? "approved" : "pending",
          hidden: !trusted,
          hiddenReason: trusted ? null : PENDING_NOTE,
        })
        .returning({ id: proposals.id, number: proposals.number });
      await tx.insert(proposalSupports).values({ proposalId: p.id, userId: viewer.id, usage: "often", cohort, showName: true });
      await tx.insert(proposalPosts).values({ proposalId: p.id, authorId: viewer.id, kind: "created", toStage: "gathering" });
      if (photos.length) await tx.insert(attachments).values(photos.map((ph) => ({ ...ph, proposalId: p.id, uploaderId: viewer.id, kind: "report" as const })));
      return p;
    });

    revalidatePath("/proposals");
    revalidatePath("/admin");
    return { number: created.number, pending: !trusted };
  });
}

/* ───────────────────────── Support ───────────────────────── */

const supportSchema = z.object({
  proposalId: uuid,
  usage: z.enum(["often", "sometimes", "backing"]),
  volunteer: z.boolean(),
  showName: z.boolean(),
  reason: z.string().transform(clean).pipe(z.string().max(280, "Keep your reason under 280 characters")),
  cohort,
});

/** Adds or updates the viewer's support. Re-submitting edits it (usage, volunteer, reason). */
export async function supportProposal(input: z.input<typeof supportSchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    const s = supportSchema.parse(input);
    return db.transaction(async (tx) => {
      const p = await loadForUpdate(tx, s.proposalId);
      if (p.hidden) throw new UserError("Proposal not found");
      if (!OPEN_STAGES.includes(p.stage)) throw new UserError("This proposal is closed.");
      await tx.update(user).set({ cohort: s.cohort }).where(eq(user.id, viewer.id));
      const [before] = await tx
        .select({ u: proposalSupports.userId })
        .from(proposalSupports)
        .where(and(eq(proposalSupports.proposalId, p.id), eq(proposalSupports.userId, viewer.id)));
      const [prior] = await tx
        .select({ reason: proposalSupports.reason, reasonApproval: proposalSupports.reasonApproval })
        .from(proposalSupports)
        .where(and(eq(proposalSupports.proposalId, p.id), eq(proposalSupports.userId, viewer.id)));
      // The support counts straight away. The written reason is public text, so a new or edited
      // one from a member is reviewed before it appears in the evidence.
      const reason = s.reason || null;
      const reasonApproval = !reason || isTrusted(viewer) ? ("approved" as const) : prior && prior.reason === reason ? prior.reasonApproval : ("pending" as const);
      const values = { usage: s.usage, volunteer: s.volunteer, showName: s.showName, reason, reasonApproval, cohort: s.cohort };
      await tx
        .insert(proposalSupports)
        .values({ proposalId: p.id, userId: viewer.id, ...values })
        .onConflictDoUpdate({ target: [proposalSupports.proposalId, proposalSupports.userId], set: values });
      const [{ supportCount }] = await tx
        .update(proposals)
        .set({ supportCount: sql`(select count(*) from proposal_supports s where s.proposal_id = ${p.id})::int`, updatedAt: new Date() })
        .where(eq(proposals.id, p.id))
        .returning({ supportCount: proposals.supportCount });

      // Milestone notification to the proposer when the goal is first reached.
      const [already] =
        supportCount >= p.goal && p.supportCount < p.goal
          ? await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.proposalId, p.id), eq(notifications.kind, "milestone"))).limit(1)
          : [{ id: "skip" }];
      if (!already) {
        await tx.insert(notifications).values({
          userId: p.authorId,
          proposalId: p.id,
          kind: "milestone",
          message: `“${p.title}” reached its goal of ${p.goal} supporters. Time to take the evidence pack to the office.`,
        });
      }
      revalidatePath(`/proposals/${p.number}`);
      return { supportCount, isNew: !before, reasonPending: reasonApproval === "pending" };
    });
  });
}

export async function withdrawSupport(proposalId: string) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    const id = uuid.parse(proposalId);
    return db.transaction(async (tx) => {
      const p = await loadForUpdate(tx, id);
      if (p.authorId === viewer.id) throw new UserError("You proposed this one — your support stays.");
      if (!OPEN_STAGES.includes(p.stage)) throw new UserError("This proposal is closed; its evidence is frozen.");
      await tx.delete(proposalSupports).where(and(eq(proposalSupports.proposalId, id), eq(proposalSupports.userId, viewer.id)));
      const [{ supportCount }] = await tx
        .update(proposals)
        .set({ supportCount: sql`(select count(*) from proposal_supports s where s.proposal_id = ${id})::int` })
        .where(eq(proposals.id, id))
        .returning({ supportCount: proposals.supportCount });
      revalidatePath(`/proposals/${p.number}`);
      return { supportCount };
    });
  });
}

/* ───────────────────────── Stage changes ───────────────────────── */

const stageSchema = z.object({
  proposalId: uuid,
  to: z.enum(STAGES),
  note: z.string().transform(clean).pipe(z.string().max(2000, "Keep the note under 2000 characters")),
  departmentId: z.string().max(40).optional().transform((v) => v || undefined),
  trialStartsOn: day,
  trialEndsOn: day,
  trialPlan: z.string().transform(clean).pipe(z.string().max(1000)).optional(),
});

export async function moveProposal(input: z.input<typeof stageSchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("admin", viewer.id);
    const s = stageSchema.parse(input);

    return db.transaction(async (tx) => {
      const p = await loadForUpdate(tx, s.proposalId);
      const decider = mayDecide(viewer, p.departmentId);
      const isAuthor = p.authorId === viewer.id;
      if (p.approval !== "approved" || (p.hidden && !isMod(viewer))) throw new UserError("This proposal isn't public, so it can't be moved.");
      const allowed = decider ? STAGE_MOVES[p.stage] : isAuthor ? (AUTHOR_MOVES[p.stage] ?? []) : [];
      if (!allowed.length) throw new UserError("Only the proposer, the owning office or an admin can move this.");
      if (!allowed.includes(s.to)) throw new UserError(`Can't move from “${STAGE_META[p.stage].label}” to “${STAGE_META[s.to].label}”.`);

      const needsNote: ProposalStage[] = ["in_review", "adopted", "declined", "withdrawn"];
      if (needsNote.includes(s.to) && s.note.length < 10)
        throw new UserError(
          s.to === "in_review"
            ? "Say who you took it to and when (at least 10 characters)."
            : s.to === "declined"
              ? "A decline needs a public reason (at least 10 characters)."
              : "Add a short public note (at least 10 characters).",
        );
      if (s.to === "trial") {
        if (!s.trialStartsOn || !s.trialEndsOn) throw new UserError("Set the trial's start and end dates.");
        if (s.trialEndsOn < s.trialStartsOn) throw new UserError("The trial can't end before it starts.");
        if (s.trialEndsOn < campusDay()) throw new UserError("The trial's end date has already passed.");
        if (daysBetween(s.trialStartsOn, s.trialEndsOn) > 180) throw new UserError("Keep a trial to six months or less.");
      }
      let departmentId = p.departmentId;
      if (s.departmentId && s.departmentId !== p.departmentId) {
        const [d] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, s.departmentId)).limit(1);
        if (!d) throw new UserError("Unknown office");
        departmentId = d.id;
      }
      // Something "with the office" or on trial needs an office, or only admins could ever act on it.
      if ((s.to === "in_review" || s.to === "trial") && !departmentId) throw new UserError("Pick the office this is with.");
      // A proposer moving their own proposal back and forth would notify every supporter each time.
      // Counted here, once the move is known to be valid.
      if (!decider) await limit("stageMove", viewer.id);
      // A note from a member is public text, so it waits for a moderator like any other post.
      const noteLive = isTrusted(viewer);

      await tx
        .update(proposals)
        .set({
          stage: s.to,
          departmentId,
          stageChangedAt: new Date(),
          updatedAt: new Date(),
          ...(s.to === "trial" ? { trialStartsOn: s.trialStartsOn, trialEndsOn: s.trialEndsOn, trialPlan: s.trialPlan || p.trialPlan } : {}),
          ...(["adopted", "declined", "withdrawn"].includes(s.to) ? { decisionNote: noteLive ? s.note : null } : {}),
        })
        .where(eq(proposals.id, p.id));
      await tx.insert(proposalPosts).values({
        proposalId: p.id,
        authorId: viewer.id,
        kind: "stage",
        fromStage: p.stage,
        toStage: s.to,
        official: decider && !isAuthor,
        departmentId: decider && !isAuthor && viewer.role === "staff" ? departmentId : null,
        // The stage change itself is public at once; a member's wording waits for a moderator.
        body: noteLive ? s.note || null : null,
      });
      if (!noteLive && s.note) {
        await tx.insert(proposalPosts).values({ proposalId: p.id, authorId: viewer.id, kind: "update", body: s.note, hidden: true, approval: "pending" });
      }
      await notifySupporters(tx, p.id, viewer.id, "stage", `“${p.title}” is now: ${STAGE_META[s.to].label}.`);
      if (viewer.role === "admin" && !isAuthor) {
        await tx.insert(auditLog).values({ actorId: viewer.id, action: `proposal.${s.to}`, targetType: "proposal", targetId: p.id, detail: s.note.slice(0, 200) });
      }
      revalidatePath(`/proposals/${p.number}`);
      revalidatePath("/proposals");
      return { stage: s.to };
    });
  });
}

/* ───────────────────────── Posts (updates + discussion) ───────────────────────── */

const postSchema = z.object({
  proposalId: uuid,
  body: text(2, 2000, "Write something first", "Keep it under 2000 characters"),
  asUpdate: z.boolean(),
});

export async function postOnProposal(input: z.input<typeof postSchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("comment", viewer.id);
    const s = postSchema.parse(input);
    return db.transaction(async (tx) => {
      const p = await loadForUpdate(tx, s.proposalId);
      const isAuthor = p.authorId === viewer.id;
      if (p.hidden && !isMod(viewer) && !isAuthor) throw new UserError("Proposal not found");
      if (p.approval !== "approved" && !isMod(viewer)) throw new UserError("This proposal hasn't been approved yet.");
      const decider = mayDecide(viewer, p.departmentId);
      const asUpdate = s.asUpdate && (decider || isAuthor);
      // Posts from members wait for a moderator; supporters are only notified once one is approved.
      const live = isTrusted(viewer);
      if (!live) {
        const [{ n: waiting }] = await tx.select({ n: count() }).from(proposalPosts).where(and(eq(proposalPosts.authorId, viewer.id), eq(proposalPosts.approval, "pending")));
        if (waiting >= MAX_PENDING_COMMENTS) throw new UserError("You have several posts waiting for approval. Give the moderators a moment.");
      }
      const [dupe] = await tx
        .select({ id: proposalPosts.id })
        .from(proposalPosts)
        .where(and(eq(proposalPosts.proposalId, p.id), eq(proposalPosts.authorId, viewer.id), eq(proposalPosts.body, s.body), gt(proposalPosts.createdAt, sql`now() - interval '1 hour'`)))
        .limit(1);
      if (dupe) throw new UserError("You already posted that here.");
      await tx.insert(proposalPosts).values({
        proposalId: p.id,
        authorId: viewer.id,
        kind: asUpdate ? "update" : "comment",
        official: asUpdate && decider && !isAuthor,
        departmentId: asUpdate && decider && !isAuthor && viewer.role === "staff" ? p.departmentId : null,
        body: s.body,
        hidden: !live,
        approval: live ? "approved" : "pending",
      });
      await tx
        .update(proposals)
        .set({ commentCount: sql`(select count(*) from proposal_posts x where x.proposal_id = ${p.id} and x.kind = 'comment' and not x.hidden)::int` })
        .where(eq(proposals.id, p.id));
      if (asUpdate && live) await notifySupporters(tx, p.id, viewer.id, "update", `Update on “${p.title}”: ${s.body.slice(0, 90)}${s.body.length > 90 ? "…" : ""}`);
      revalidatePath(`/proposals/${p.number}`);
      revalidatePath("/admin");
      return { pending: !live };
    });
  });
}

/* ───────────────────────── Trial check-ins ───────────────────────── */

const checkinSchema = z.object({
  proposalId: uuid,
  rating: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  note: z.string().transform(clean).pipe(z.string().max(280, "Keep it under 280 characters")),
});

export async function checkIn(input: z.input<typeof checkinSchema>) {
  return run(async () => {
    const viewer = await requireViewer();
    await limit("vote", viewer.id);
    const s = checkinSchema.parse(input);
    const today = campusDay();
    const [p] = await db.select().from(proposals).where(eq(proposals.id, s.proposalId)).limit(1);
    if (!p || p.hidden) throw new UserError("Proposal not found");
    if (p.stage !== "trial") throw new UserError("Check-ins open only during a trial run.");
    if (p.trialStartsOn && today < p.trialStartsOn) throw new UserError("The trial hasn't started yet.");
    if (p.trialEndsOn && today > p.trialEndsOn) throw new UserError("The trial has ended.");
    await db
      .insert(trialCheckins)
      .values({ proposalId: p.id, userId: viewer.id, day: today, rating: s.rating, note: s.note || null })
      .onConflictDoUpdate({ target: [trialCheckins.proposalId, trialCheckins.userId, trialCheckins.day], set: { rating: s.rating, note: s.note || null } });
    revalidatePath(`/proposals/${p.number}`);
    return {};
  });
}

/* ───────────────────────── Moderation ───────────────────────── */

export async function setProposalHidden(proposalId: string, hidden: boolean) {
  return run(async () => {
    const viewer = await requireMod();
    const id = uuid.parse(proposalId);
    const hide = z.boolean().parse(hidden);
    const [before] = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
    if (!before) throw new UserError("Proposal not found");
    await db
      .update(proposals)
      .set({ hidden: hide, hiddenReason: hide ? "Hidden by a moderator" : null, updatedAt: new Date(), ...(hide ? {} : { approval: "approved" as const }) })
      .where(eq(proposals.id, id));
    // Restoring one that never went public is an approval, so the author hears about it.
    if (!hide && before.approval !== "approved") {
      await db.insert(notifications).values({ userId: before.authorId, proposalId: id, kind: "review", message: `“${before.title.slice(0, 50)}” is approved and live. Share it to start collecting support.` });
    }
    await db.insert(auditLog).values({ actorId: viewer.id, action: hide ? "proposal.hide" : "proposal.restore", targetType: "proposal", targetId: id });
    revalidatePath(`/proposals/${before.number}`);
    revalidatePath("/proposals");
    return {};
  });
}

export async function setPostHidden(postId: string, hidden: boolean) {
  return run(async () => {
    const viewer = await requireMod();
    const id = uuid.parse(postId);
    hidden = z.boolean().parse(hidden);
    const [post] = await db
      .update(proposalPosts)
      .set({ hidden, ...(hidden ? {} : { approval: "approved" as const }) })
      .where(eq(proposalPosts.id, id))
      .returning({ proposalId: proposalPosts.proposalId });
    if (!post) throw new UserError("Post not found");
    const [p] = await db
      .update(proposals)
      .set({ commentCount: sql`(select count(*) from proposal_posts x where x.proposal_id = ${post.proposalId} and x.kind = 'comment' and not x.hidden)::int` })
      .where(eq(proposals.id, post.proposalId))
      .returning({ number: proposals.number });
    await db.insert(auditLog).values({ actorId: viewer.id, action: hidden ? "proposal_post.hide" : "proposal_post.restore", targetType: "proposal_post", targetId: id });
    revalidatePath(`/proposals/${p!.number}`);
    return {};
  });
}
