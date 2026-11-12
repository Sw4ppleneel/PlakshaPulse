import { twMerge } from "tailwind-merge";

/** Joins class names and lets later Tailwind utilities override earlier ones (e.g. `inline-flex` + `hidden`). */
export function cn(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}

export function timeAgo(iso: string | Date, now = Date.now()) {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.round(mo / 12)}y ago`;
}

export function duration(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(hours < 240 ? 1 : 0).replace(/\.0$/, "")}d`;
}

export function hoursBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

/** SLA chip text for an active issue. */
export function slaLabel(dueAt: string, now = Date.now()) {
  const diffH = (new Date(dueAt).getTime() - now) / 3_600_000;
  if (diffH < 0) return { text: `Overdue ${duration(-diffH)}`, tone: "danger" as const };
  if (diffH < 12) return { text: `Due in ${duration(diffH)}`, tone: "warn" as const };
  return { text: `Due in ${duration(diffH)}`, tone: "muted" as const };
}

export function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function initials(name: string) {
  return name
    .replace(/^prof\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
