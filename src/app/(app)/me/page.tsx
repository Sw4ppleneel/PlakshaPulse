import Link from "next/link";
import { IssueRow } from "@/components/issue-row";
import { EmptyState, buttonClass } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getNotifications, getTaxonomy, listIssues } from "@/server/queries";

export const metadata = { title: "Me" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewerPage();
  const tab = (await searchParams).tab === "watching" ? "watching" : (await searchParams).tab === "updates" ? "updates" : "reported";
  const [tax, reported, watching, notes] = await Promise.all([
    getTaxonomy(),
    listIssues(viewer, { view: "all", mine: "reported", sort: "new" }),
    listIssues(viewer, { view: "all", mine: "watching", sort: "updated" }),
    getNotifications(viewer, 50),
  ]);
  const cats = new Map(tax.categories.map((c) => [c.id, c]));
  const locs = new Map(tax.locations.map((l) => [l.id, l.name]));
  const list = tab === "reported" ? reported : watching;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[34px] leading-tight tracking-tight">Hi, {viewer.name.split(" ")[0]}</h1>
        <p className="mt-1 text-[15px] text-ink-muted">
          You&apos;ve reported <b className="text-ink">{reported.length}</b> and follow <b className="text-ink">{watching.length}</b> issues.
        </p>
      </div>
      <div className="inline-flex rounded-full border border-line-strong bg-surface p-1">
        {(
          [
            ["reported", "Reported"],
            ["watching", "Following"],
            ["updates", "Updates"],
          ] as const
        ).map(([k, l]) => (
          <Link key={k} href={`/me?tab=${k}`} className={cn("rounded-full px-4 py-1.5 text-sm font-medium", tab === k ? "bg-ink text-bg" : "text-ink-muted hover:text-ink")}>
            {l}
          </Link>
        ))}
      </div>
      {tab === "updates" ? (
        <div className="card divide-y divide-line overflow-hidden">
          {notes.length === 0 && <EmptyState title="No updates yet" />}
          {notes.map((n) => (
            <Link key={n.id} href={n.issueNumber ? `/issues/${n.issueNumber}` : "/me"} className={cn("flex gap-3 px-5 py-3.5 hover:bg-surface-2", !n.readAt && "bg-brand-soft/50")}>
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-line-strong" : "bg-brand")} />
              <span>
                <span className="block text-sm">{n.message}</span>
                <span className="text-xs text-ink-muted" suppressHydrationWarning>
                  {timeAgo(n.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState title={tab === "reported" ? "You haven't reported anything" : "Not following anything yet"}>
            <div className="mt-4">
              <Link href={tab === "reported" ? "/issues/new" : "/board"} className={buttonClass("primary")}>
                {tab === "reported" ? "Report an issue" : "Browse the board"}
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {list.map((i) => (
            <IssueRow key={i.id} issue={i} cat={cats.get(i.categoryId)} locationName={i.locationId ? locs.get(i.locationId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
