import { Check, Lightbulb } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion";
import { GoalBar, Pipeline, ProposalCardView, StagePill } from "@/components/proposal-ui";
import { ApprovalTag } from "@/components/review";
import { LiveRefresh } from "@/components/shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { AREA_LABEL, AREAS } from "@/lib/constants";
import { cn } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getProposalStats, listProposals, type ProposalCard } from "@/server/proposal-queries";
import { ProposalToolbar } from "./toolbar";

export const metadata = { title: "Proposals" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 60);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const dayStr = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null);

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewerPage();
  const sp = await searchParams;
  const show = (["open", "done", "mine"] as const).find((v) => v === one(sp.show)) ?? "open";
  const area = AREAS.find((a) => a.id === one(sp.area))?.id;
  const mode = one(sp.mode) === "list" ? "list" : "cards";
  const sort = (["moving", "new", "top", "updated"] as const).find((v) => v === one(sp.sort)) ?? "moving";

  const [rows, stats] = await Promise.all([
    show === "mine" ? listProposals(viewer, { stage: "open", mine: true, area }).then(async (open) => [...open, ...(await listProposals(viewer, { stage: "done", mine: true, area }))]) : listProposals(viewer, { stage: show, area }),
    getProposalStats(),
  ]);
  const sorted =
    sort === "new"
      ? [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : sort === "top"
        ? [...rows].sort((a, b) => b.supportCount - a.supportCount)
        : sort === "updated"
          ? [...rows].sort((a, b) => b.stageChangedAt.localeCompare(a.stageChangedAt))
          : rows;

  return (
    <div className="space-y-6">
      <LiveRefresh seconds={60} />
      <PageHeader
        title="Proposals"
        sub={
          stats.open + stats.adopted === 0 ? (
            "Things that should exist at Plaksha. The support a proposal collects is the interest poll."
          ) : (
            <span className="tabular">
              {stats.open} open · {stats.people} {stats.people === 1 ? "person" : "people"} backing something
              {stats.trials > 0 && ` · ${stats.trials} in trial`}
              {stats.adopted > 0 && ` · ${stats.adopted} adopted`}
            </span>
          )
        }
      />

      <ProposalToolbar />

      {sorted.length === 0 ? (
        <div className="card">
          <EmptyState title={show === "mine" ? "You haven't backed anything yet" : show === "done" ? "Nothing decided yet" : "No proposals here yet"} icon={<Lightbulb size={28} />}>
            {show === "open" ? (
              <>
                Be the first. A space you want opened, a timing changed, an event that should happen every month.{" "}
                <Link href="/proposals/new" className="font-semibold text-brand hover:underline">
                  Propose it →
                </Link>
              </>
            ) : (
              "Proposals that are adopted or declined stay here permanently, with the reason."
            )}
          </EmptyState>
        </div>
      ) : mode === "cards" ? (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p, i) => (
            <StaggerItem key={p.id}>
              <ProposalCardView p={p} feature={i === 0 && show === "open" && sort === "moving"} />
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <ListView rows={sorted} />
      )}
    </div>
  );
}

/** Dense, date-first view: when it was proposed, when it last moved, and when its trial runs. */
function ListView({ rows }: { rows: ProposalCard[] }) {
  return (
    <div className="card overflow-hidden p-1.5">
      <div className="label hidden grid-cols-[minmax(0,1fr)_150px_84px_84px_128px_170px] gap-4 px-6 pb-1 pt-5 lg:grid">
        <span>Proposal</span>
        <span>Stage</span>
        <span>Proposed</span>
        <span>Last moved</span>
        <span>Trial</span>
        <span>Support</span>
      </div>
      <ul>
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/proposals/${p.number}`}
              className="grid gap-x-4 gap-y-2.5 rounded-[22px] px-4 py-4 transition-colors hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_150px_84px_84px_128px_170px] lg:items-center lg:px-[18px]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-ink-muted tabular">P-{p.number}</span>
                  <span className="truncate font-medium">{p.title}</span>
                  {p.viewerSupports && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                      <Check size={10} strokeWidth={3} /> You
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-muted">
                  {AREA_LABEL[p.area] ?? p.area} · {p.authorName}
                  {p.departmentName && ` · ${p.departmentName}`}
                </div>
              </div>
              <div>{p.approval === "approved" ? <StagePill stage={p.stage} /> : <ApprovalTag approval={p.approval} />}</div>
              <div className="grid grid-cols-[auto_auto_1fr] gap-x-5 lg:contents">
                <Cell label="Proposed" value={date(p.createdAt)} />
                <Cell label="Last moved" value={date(p.stageChangedAt)} />
                <Cell label="Trial" value={p.trialStartsOn ? `${dayStr(p.trialStartsOn)} – ${dayStr(p.trialEndsOn)}` : "—"} muted={!p.trialStartsOn} />
              </div>
              <div className="flex items-center gap-3">
                <span className={cn("w-14 shrink-0 text-sm font-semibold tabular", p.supportCount >= p.goal && "text-ok")}>
                  {p.supportCount}
                  <span className="font-normal text-ink-muted">/{p.goal}</span>
                </span>
                {p.stage === "gathering" ? <GoalBar count={p.supportCount} goal={p.goal} size="sm" className="flex-1" /> : <div className="flex-1"><Pipeline stage={p.stage} compact /></div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("text-sm tabular", muted && "text-ink-muted")}>
      <span className="block text-[11px] text-ink-muted lg:hidden">{label}</span>
      {value}
    </div>
  );
}
