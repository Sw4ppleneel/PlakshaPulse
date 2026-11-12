import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { user, type Role } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/env";

export type Viewer = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  departmentId: string | null;
};

/**
 * The single source of truth for "who is calling". Every page, server action and route
 * handler goes through this — the proxy's redirect is only a UX convenience.
 * Re-reads the user row so bans and role changes apply on the next request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [u] = await db.select().from(user).where(eq(user.id, s.user.id)).limit(1);
  if (!u || u.banned || !u.emailVerified || !isAllowedEmail(u.email)) return null;
  return { id: u.id, name: u.name, email: u.email, image: u.image, role: u.role, departmentId: u.departmentId };
});

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

/** For pages: redirect to sign-in. */
export async function requireViewerPage(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/signin");
  return v;
}

/** For actions/route handlers: throw. */
export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new AuthError("Please sign in.");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await requireViewer();
  if (v.role !== "admin") throw new AuthError("Admins only.", 403);
  return v;
}

export const isStaffish = (v: Viewer | null) => v?.role === "admin" || v?.role === "staff";

/** Staff can act on issues routed to their department; admins on everything. */
export function canManage(v: Viewer | null, issueDepartmentId: string) {
  if (!v) return false;
  if (v.role === "admin") return true;
  return v.role === "staff" && !!v.departmentId && v.departmentId === issueDepartmentId;
}
