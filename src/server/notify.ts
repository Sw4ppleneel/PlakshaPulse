import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { issueWatchers, notifications } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function watch(tx: Tx | typeof db, issueId: string, userId: string) {
  await tx.insert(issueWatchers).values({ issueId, userId }).onConflictDoNothing();
}

/** Fan out an in-app notification to everyone watching an issue except the actor. */
export async function notifyWatchers(
  tx: Tx | typeof db,
  issueId: string,
  actorId: string | null,
  kind: string,
  message: string,
) {
  const rows = await tx
    .select({ userId: issueWatchers.userId })
    .from(issueWatchers)
    .where(actorId ? and(eq(issueWatchers.issueId, issueId), ne(issueWatchers.userId, actorId)) : eq(issueWatchers.issueId, issueId));
  if (!rows.length) return;
  await tx.insert(notifications).values(rows.map((r) => ({ userId: r.userId, issueId, kind, message })));
}
