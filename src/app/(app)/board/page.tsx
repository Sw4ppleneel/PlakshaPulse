import Link from "next/link";
import { BoardToolbar } from "@/components/board-toolbar";
import { BubbleField } from "@/components/bubble-field";
import { IssueRow } from "@/components/issue-row";
import { LiveRefresh } from "@/components/shell";
import { Stagger, StaggerItem } from "@/components/motion";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { duration } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getPulseStats, getTaxonomy, listIssues, type BoardFilter } from "@/server/queries";
import { sweep } from "@/server/sweep";

export const metadata = { title: "Board" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 100);

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewerPage();
  const sp = await searchParams;
  await sweep().catch(() => 0);

  const view = (["active", "fixed", "all"] as const).find((v) => v === one(sp.view)) ?? "active";
  const sort = (["hot", "new", "top", "updated"] as const).find((v) => v === one(sp.sort)) ?? (view === "fixed" ? "updated" : "hot");
  const mode = one(sp.mode) === "list" ? "list" : "bubbles";
  const filter: BoardFilter = { view, sort, category: one(sp.category), location: one(sp.location), q: one(sp.q) };

  const [tax, issues, all, stats] = await Promise.all([
    getTaxonomy(),
    listIssues(viewer, filter),
    listIssues(viewer, { view, location: filter.location, q: filter.q }),
    getPulseStats(),
  ]);
  const cats = new Map(tax.categories.map((c) => [c.id, c]));
  const locs = new Map(tax.locations.map((l) => [l.id, l.name]));
  const counts: Record<string, number> = {};
  for (const i of all) counts[i.categoryId] = (counts[i.categoryId] ?? 0) + 1;
  const hottest = [...issues].sort((a, b) => b.heat - a.heat).slice(0, 6);

  return (
    <div className="space-y-6">
      <LiveRefresh seconds={20} />
      <PageHeader
        title="Issues"
        sub={
          <span className="tabular">
            {stats.active} active · {stats.fixedWeek} fixed this week
            {stats.medianHours != null && ` · usually fixed in ${duration(stats.medianHours)}`}
          </span>
        }
      />

      <BoardToolbar categories={tax.categories} locations={tax.locations} counts={counts} />

      {issues.length === 0 ? (
        <div className="card">
          <EmptyState title={filter.q ? "No matches" : "Nothing here — nice."}>
            {filter.q ? "Try a different search, or report it if it's new." : "No issues match these filters."}
            <div className="mt-4">
              <Link href="/issues/new" className={buttonClass("primary")}>
                Report an issue
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : mode === "bubbles" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="card overflow-hidden">
            <BubbleField
              issues={issues}
              categories={tax.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
              groupBy={one(sp.group) === "category" ? "category" : "none"}
              height={560}
            />
            <p className="px-5 pb-4 text-[13px] text-ink-muted">Bigger means more people affected. A glow means it&apos;s active right now.</p>
          </div>
          <aside className="card h-fit p-2">
            <h2 className="px-3 pb-1 pt-3 text-base font-semibold">Heating up</h2>
            <Stagger as="ol">
              {hottest.map((i) => (
                <StaggerItem as="li" key={i.id}>
                  <Link href={`/issues/${i.number}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold tabular">{i.metooCount}</span>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-medium leading-snug">{i.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{cats.get(i.categoryId)?.name}</span>
                    </span>
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          </aside>
        </div>
      ) : (
        <Stagger className="card overflow-hidden p-1.5">
          {issues.map((i) => (
            <StaggerItem key={i.id}>
              <IssueRow issue={i} cat={cats.get(i.categoryId)} locationName={i.locationId ? locs.get(i.locationId) : undefined} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
