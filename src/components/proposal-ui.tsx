import { Check, FlaskConical } from "lucide-react";
import Link from "next/link";
import { ApprovalTag } from "./review";
import { AREA_LABEL, PIPELINE, STAGE_META, type Stage } from "@/lib/constants";
import { cn } from "@/lib/format";
import type { ProposalCard as Card } from "@/server/proposal-queries";

/** Form control: soft fill, 16px text (see `.field` in globals.css). */
export const inputClass = "field";

const STAGE_STYLE: Record<Stage, string> = {
  gathering: "bg-accent-soft text-accent-ink",
  in_review: "bg-[color-mix(in_srgb,var(--aqua)_14%,transparent)] text-aqua",
  trial: "bg-brand-soft text-brand",
  adopted: "bg-ok-soft text-ok",
  declined: "bg-surface-2 text-ink-muted",
  withdrawn: "bg-surface-2 text-ink-muted",
};

export function StagePill({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span title={STAGE_META[stage].hint} className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", STAGE_STYLE[stage], className)}>
      {stage === "trial" ? <FlaskConical size={12} aria-hidden /> : stage === "adopted" ? <Check size={12} strokeWidth={3} aria-hidden /> : <span className="size-1.5 rounded-full bg-current" />}
      {STAGE_META[stage].label}
    </span>
  );
}

/** Support against the goal. Past the goal the bar stays full and the overshoot is called out. */
export function GoalBar({ count, goal, className, size = "md" }: { count: number; goal: number; className?: string; size?: "sm" | "md" }) {
  const p = Math.min(1, count / Math.max(1, goal));
  const met = count >= goal;
  return (
    <div className={className}>
      <div className={cn("overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2")}>
        <div className="grow-x h-full rounded-full bg-mint" style={{ width: `${Math.max(3, p * 100)}%` }} />
      </div>
      {size === "md" && (
        <div className="mt-2 flex justify-between text-[13px] text-ink-muted tabular">
          <span>
            <b className="font-semibold text-ink">{count}</b> of {goal}
          </span>
          <span className={met ? "font-medium text-ok" : ""}>{met ? "Goal reached" : `${goal - count} to go`}</span>
        </div>
      )}
    </div>
  );
}

/** The four-step path every proposal follows, with the current step lit. */
export function Pipeline({ stage, compact = false }: { stage: Stage; compact?: boolean }) {
  const step = STAGE_META[stage].step;
  return (
    <ol className={cn("grid grid-cols-4", compact ? "gap-1" : "gap-2")}>
      {PIPELINE.map((s, i) => {
        const n = i + 1;
        const done = step > n || (n === 4 && stage === "adopted");
        const current = step === n && !done;
        const declined = n === 4 && stage === "declined";
        return (
          <li key={s.stage} className="min-w-0">
            <div
              className={cn(
                "h-1.5 rounded-full",
                done ? "bg-mint" : declined ? "bg-ink-muted" : current ? "bg-mint/50" : "bg-surface-3",
                current && "animate-pulse",
              )}
            />
            {!compact && (
              <div className="mt-2">
                <div className={cn("text-[13px] font-medium leading-tight", current ? "text-brand" : done ? "text-ink" : "text-ink-muted")}>
                  {n === 4 && stage === "declined" ? "Not approved" : n === 4 && stage === "adopted" ? "Adopted" : s.label}
                </div>
                <div className="mt-0.5 hidden text-xs leading-snug text-ink-muted sm:block">{s.detail}</div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Cumulative supporters over time. Pure SVG so it renders on the server and prints cleanly. */
export function GrowthChart({ points, goal, height = 120 }: { points: { day: string; total: number }[]; goal: number; height?: number }) {
  if (points.length === 0) return null;
  const series = points.length === 1 ? [{ day: points[0]!.day, total: 0 }, points[0]!] : points;
  const W = 600;
  const H = height;
  const pad = { t: 10, r: 8, b: 20, l: 8 };
  const max = Math.max(goal, series[series.length - 1]!.total) * 1.08;
  const x = (i: number) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join("");
  const area = `${line}L${x(series.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const fmt = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Supporters over time, reaching ${series[series.length - 1]!.total}`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--ok)" strokeDasharray="4 4" strokeWidth={1} />
      <text x={W - pad.r} y={y(goal) - 4} textAnchor="end" fontSize={10} fill="var(--ok)" fontWeight={600}>
        Goal {goal}
      </text>
      <path d={area} fill="var(--brand)" fillOpacity={0.12} />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1]!.total)} r={3.5} fill="var(--brand)" />
      <text x={pad.l} y={H - 4} fontSize={10} fill="var(--ink-muted)">
        {fmt(points[0]!.day)}
      </text>
      <text x={W - pad.r} y={H - 4} fontSize={10} fill="var(--ink-muted)" textAnchor="end">
        {fmt(points[points.length - 1]!.day)}
      </text>
    </svg>
  );
}

/** Horizontal share bars — used for cohort and intended-use breakdowns. */
export function Breakdown({ rows, total }: { rows: { label: string; n: number; tone?: string }[]; total: number }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="shrink-0 tabular text-ink-muted">
              <b className="text-ink">{r.n}</b> · {total ? Math.round((r.n / total) * 100) : 0}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("grow-x h-full rounded-full", r.tone ?? "bg-mint")} style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A proposal on the list. `feature` is the dark card used for the one moving fastest. */
export function ProposalCardView({ p, feature = false }: { p: Card; feature?: boolean }) {
  const facts = [p.weeklyUsers > 0 && `${p.weeklyUsers} would use it weekly`, p.volunteers > 0 && `${p.volunteers} offered to help`].filter(Boolean) as string[];
  return (
    <Link href={`/proposals/${p.number}`} className={cn("press group flex h-full flex-col rounded-3xl p-5", feature ? "on-dark" : "card")}>
      <div className="flex items-center justify-between gap-2">
        <span className="label truncate">{AREA_LABEL[p.area] ?? p.area}</span>
        {p.approval === "approved" ? <StagePill stage={p.stage} /> : <ApprovalTag approval={p.approval} />}
      </div>
      <h3 className="mt-4 text-[19px] font-semibold leading-snug tracking-tight">{p.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">{p.ask}</p>
      <div className="mt-auto pt-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="text-[32px] font-semibold leading-none tracking-tight tabular">{p.supportCount}</span>
            <span className="ml-1.5 text-[13px] text-ink-muted">{p.stage === "gathering" ? `of ${p.goal}` : "supporters"}</span>
          </div>
          {p.recent > 0 && p.stage === "gathering" && <span className="text-[13px] font-medium text-brand tabular">+{p.recent} this week</span>}
        </div>
        <div className="mt-3">{p.stage === "gathering" ? <GoalBar count={p.supportCount} goal={p.goal} size="sm" /> : <Pipeline stage={p.stage} compact />}</div>
        {facts.length > 0 && <p className="mt-3 truncate text-[13px] text-ink-muted">{facts.join(" · ")}</p>}
      </div>
    </Link>
  );
}
