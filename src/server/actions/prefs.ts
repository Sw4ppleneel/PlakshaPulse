"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { requireViewer } from "../dal";
import { getNotifications } from "../queries";

export async function setTheme(theme: "light" | "dark" | "system") {
  const t = z.enum(["light", "dark", "system"]).parse(theme);
  const jar = await cookies();
  if (t === "system") jar.delete("theme");
  else jar.set("theme", t, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}

export async function fetchNotifications() {
  const viewer = await requireViewer();
  return getNotifications(viewer, 25);
}
