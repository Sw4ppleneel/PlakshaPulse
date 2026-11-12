import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/server/dal";
import { findSimilar } from "@/server/queries";
import { limit, RateLimitError } from "@/server/rate-limit";

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await limit("search", viewer.id);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
    throw e;
  }
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 140);
  const category = sp.get("category")?.slice(0, 40) || undefined;
  const location = sp.get("location")?.slice(0, 40) || undefined;
  const results = await findSimilar(viewer, q, category, location);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
