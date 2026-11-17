import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { issues } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** comment_count is what lists show; it must match what people can actually see. */
export async function recountComments(tx: Tx | typeof db, issueId: string) {
  await tx
    .update(issues)
    .set({ commentCount: sql`(select count(*) from comments c where c.issue_id = ${issueId} and not c.hidden)::int` })
    .where(eq(issues.id, issueId));
}
