import { Flame, Radio } from "lucide-react";
import Link from "next/link";
import { BoardToolbar } from "@/components/board-toolbar";
import { BubbleField } from "@/components/bubble-field";
import { IssueRow } from "@/components/issue-row";
import { LiveRefresh } from "@/components/shell";
import { CategoryIcon, EmptyState, Stat, StatusPill, buttonClass } from "@/components/ui";
import { duration, pct } from "@/lib/format";
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
    <div className="space-y-5">
      <LiveRefresh seconds={20} />
      <section className="flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand">
            <Radio size={12} className="animate-pulse" /> Live campus pulse
          </div>
          <h1 className="font-display mt-2 text-[34px] leading-[1.05] tracking-tight sm:text-[44px]">
            What&apos;s broken at Plaksha, <span className="italic text-brand">right now.</span>
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-ink-muted">
            Every report is public to the whole campus — students, faculty and admin. Bubbles grow as more people say <b className="text-ink">me too</b>.
          </p>
        </div>
      </section>

      <section className="card grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-5 sm:p-6">
        <Stat label="Active issues" value={stats.active} tone="brand" />
        <Stat label="Reported · 7d" value={stats.reportedWeek} />
        <Stat label="Fixed · 7d" value={stats.fixedWeek} tone="ok" />
        <Stat label="Median fix time" value={duration(stats.medianHours)} hint="last 30 days" />
        <Stat label="Fixed on time" value={pct(stats.onTime)} hint={`${stats.people} people weighed in`} />
      </section>

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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="card dot-grid overflow-hidden">
            <BubbleField
              issues={issues}
              categories={tax.categories.map((c) => ({ id: c.id, name: c.name, color: c.color }))}
              groupBy={one(sp.group) === "category" ? "category" : "none"}
              height={600}
            />
            <Legend />
          </div>
          <aside className="card h-fit overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold">
              <Flame size={16} className="text-[#E4572E]" /> Heating up
            </div>
            <ol>
              {hottest.map((i, idx) => {
                const c = cats.get(i.categoryId);
                return (
                  <li key={i.id}>
                    <Link href={`/issues/${i.number}`} className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2">
                      <span className="font-display w-5 shrink-0 text-lg leading-6 text-ink-muted tabular">{idx + 1}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-sm font-medium leading-snug">{i.title}</span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
                          {c && <CategoryIcon icon={c.icon} color={c.color} size={12} />}
                          <b className="text-ink tabular">{i.metooCount}</b> affected
                          <StatusPill status={i.status} short />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {issues.map((i) => (
            <IssueRow key={i.id} issue={i} cat={cats.get(i.categoryId)} locationName={i.locationId ? locs.get(i.locationId) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-surface/80 px-4 py-3 text-xs text-ink-muted backdrop-blur">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-end gap-0.5">
          <span className="size-2 rounded-full bg-ink-muted/50" />
          <span className="size-3.5 rounded-full bg-ink-muted/50" />
        </span>
        Size = people affected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-full bg-brand/40 shadow-[0_0_10px_var(--brand)]" /> Glow = recent activity
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-full border border-dashed border-ink-muted" /> New
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-full border-2 border-brand border-r-transparent" /> In progress
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3.5 rounded-full border-2 border-ok" /> Fixed, awaiting confirmation
      </span>
      <span className="ml-auto hidden sm:inline">Drag bubbles · click to open</span>
    </div>
  );
}
