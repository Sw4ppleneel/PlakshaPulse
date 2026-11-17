import { CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { CategoryIcon, EmptyState, Stat, StatusPill } from "@/components/ui";
import { cn, duration, hoursBetween, pct, timeAgo } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getPulseStats, getTaxonomy, listRecentlyFixed } from "@/server/queries";

export const metadata = { title: "Fixed" };

export default async function FixedPage() {
  await requireViewerPage();
  const [items, tax, stats] = await Promise.all([listRecentlyFixed(60), getTaxonomy(), getPulseStats()]);
  const cats = new Map(tax.categories.map((c) => [c.id, c]));
  const people = items.reduce((s, i) => s + i.metooCount, 0);

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-[13px] text-ok">
          <CheckCircle2 size={12} /> Public resolution log
        </div>
        <h1 className="title">What got fixed</h1>
        <p className="mt-1 max-w-xl text-[15px] text-ink-muted">Every fix, what was done, how long it took — and whether the people who reported it agreed.</p>
      </div>
      <section className="card grid grid-cols-2 gap-6 p-5 sm:grid-cols-4 sm:p-6">
        <Stat label="Fixed · 7 days" value={stats.fixedWeek} tone="ok" />
        <Stat label="Median fix time" value={duration(stats.medianHours)} />
        <Stat label="On time" value={pct(stats.onTime)} />
        <Stat label="People helped" value={people} hint="across issues below" />
      </section>
      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="No fixes yet">They&apos;ll show up here as departments resolve issues.</EmptyState>
        </div>
      ) : (
        <ol className="grid gap-3 md:grid-cols-2">
          {items.map((i) => {
            const c = cats.get(i.categoryId);
            const took = i.resolvedAt ? hoursBetween(i.createdAt, i.resolvedAt) : null;
            const onTime = i.resolvedAt ? new Date(i.resolvedAt) <= new Date(i.dueAt) : false;
            return (
              <li key={i.id}>
                <Link href={`/issues/${i.number}`} className="card flex h-full flex-col p-5 transition-shadow hover:!shadow-[var(--shadow-pop)]">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    {c && <CategoryIcon icon={c.icon} color={c.color} size={13} />}
                    <span>{i.departmentName}</span>
                    <span className="ml-auto" suppressHydrationWarning>
                      {i.resolvedAt && timeAgo(i.resolvedAt)}
                    </span>
                  </div>
                  <div className="mt-2 font-semibold leading-snug">{i.title}</div>
                  {i.resolutionNote && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-2">“{i.resolutionNote}”</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs">
                    <StatusPill status={i.status} />
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", onTime ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                      <Clock size={11} /> {duration(took)} {onTime ? "· on time" : "· late"}
                    </span>
                    <span className="ml-auto text-ink-muted">
                      <b className="text-ink tabular">{i.metooCount}</b> affected
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
