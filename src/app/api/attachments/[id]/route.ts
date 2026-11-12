import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { attachments, issues } from "@/db/schema";
import { canManage, getViewer } from "@/server/dal";
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
    .select({ data: attachments.data, mime: attachments.mime, hidden: issues.hidden, departmentId: issues.departmentId, reporterId: issues.reporterId })
    .from(attachments)
    .innerJoin(issues, eq(issues.id, attachments.issueId))
    .where(eq(attachments.id, parsed.data))
    .limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  if (row.hidden && !canManage(viewer, row.departmentId) && row.reporterId !== viewer.id) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
