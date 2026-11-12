import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import { cn, duration, pct } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getDepartmentScoreboard } from "@/server/queries";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requireViewerPage();
  const rows = await getDepartmentScoreboard();
  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <h1 className="font-display text-[34px] leading-tight tracking-tight sm:text-[42px]">Who&apos;s on it</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-ink-muted">
          Every office&apos;s queue and track record, computed live from the board. Fix times and on-time rates cover the last 90 days.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((d) => {
          const delta = d.fixed30 - d.fixedPrev30;
          const onTimeTone = d.onTime == null ? "" : d.onTime >= 0.8 ? "text-ok" : d.onTime >= 0.5 ? "text-warn" : "text-danger";
          return (
            <div key={d.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{d.name}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">{d.description}</div>
                </div>
                {d.overdue > 0 && <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">{d.overdue} overdue</span>}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric label="Open" value={String(d.open)} />
                <Metric label="Median fix" value={duration(d.medianHours)} />
                <Metric label="On time" value={pct(d.onTime)} className={onTimeTone} />
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-line pt-3 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <b className="text-ink tabular">{d.fixed30}</b> fixed in 30d
                  {delta > 0 ? <ArrowUpRight size={13} className="text-ok" /> : delta < 0 ? <ArrowDownRight size={13} className="text-danger" /> : <Minus size={12} />}
                </span>
                <span>
                  First response <b className="text-ink">{duration(d.medianAckHours)}</b>
                </span>
                {d.reopened > 0 && <span className="text-warn">{d.reopened} reopened</span>}
              </div>
              <Link href={`/board?mode=list&sort=top`} className="sr-only">
                View issues
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div className={cn("font-display mt-1 text-2xl tabular", className)}>{value}</div>
    </div>
  );
}
