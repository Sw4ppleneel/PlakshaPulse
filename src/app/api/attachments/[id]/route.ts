import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attachments, issues, proposals } from "@/db/schema";
import { canManage, getViewer, isMod } from "@/server/dal";
import { limit, RateLimitError } from "@/server/rate-limit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Unauthorized", { status: 401 });
  try {
    await limit("read", viewer.id);
  } catch (e) {
    if (e instanceof RateLimitError) return new NextResponse("Too many requests", { status: 429 });
    throw e;
  }
  const parsed = z.string().uuid().safeParse((await ctx.params).id);
  if (!parsed.success) return new NextResponse("Not found", { status: 404 });

  const [row] = await db
    .select({
      data: attachments.data,
      mime: attachments.mime,
      issueId: attachments.issueId,
      hidden: issues.hidden,
      departmentId: issues.departmentId,
      reporterId: issues.reporterId,
      proposalHidden: proposals.hidden,
      proposalAuthorId: proposals.authorId,
    })
    .from(attachments)
    .leftJoin(issues, eq(issues.id, attachments.issueId))
    .leftJoin(proposals, eq(proposals.id, attachments.proposalId))
    .where(eq(attachments.id, parsed.data))
    .limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  const visible = row.issueId
    ? !row.hidden || canManage(viewer, row.departmentId ?? "") || isMod(viewer) || row.reporterId === viewer.id
    : row.proposalAuthorId != null && (!row.proposalHidden || isMod(viewer) || row.proposalAuthorId === viewer.id);
  if (!visible) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      // Short-lived: a photo a moderator hides should stop showing within minutes, even from caches.
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
