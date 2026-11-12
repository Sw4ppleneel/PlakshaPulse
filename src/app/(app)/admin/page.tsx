import { AlertTriangle, CheckCircle2, Flag, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { CategoryIcon, EmptyState, SlaChip, StatusPill, buttonClass } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import { getFlagQueue, getTriage, type QueueItem } from "@/server/admin-queries";
import { isStaffish, requireViewerPage } from "@/server/dal";
import { getTaxonomy } from "@/server/queries";
import { notFound } from "next/navigation";
import { FlagActions } from "./flag-actions";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireViewerPage();
  if (!isStaffish(viewer)) notFound();
  const isAdmin = viewer.role === "admin";
  const [triage, flags, tax] = await Promise.all([getTriage(viewer), isAdmin ? getFlagQueue() : Promise.resolve([]), getTaxonomy()]);
  const cats = new Map(tax.categories.map((c) => [c.id, c]));
  const deptName = tax.departments.find((d) => d.id === viewer.departmentId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[34px] leading-tight tracking-tight">{isAdmin ? "Campus admin" : `${deptName ?? "Department"} queue`}</h1>
          <p className="mt-1 text-[15px] text-ink-muted">
            {isAdmin ? "Triage across all departments, moderation and people." : "Issues routed to your office. Everything you post here is public on the issue."}
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin/people" className={buttonClass("secondary")}>
            <Users size={16} /> People & roles
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Count icon={Inbox} label="Needs triage" value={triage.untriaged.length} />
        <Count icon={AlertTriangle} label="Overdue" value={triage.overdue.length} tone="danger" />
        <Count icon={CheckCircle2} label="Awaiting confirmation" value={triage.awaiting.length} tone="ok" />
        {isAdmin && <Count icon={Flag} label="Flagged" value={flags.length} tone="warn" />}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Queue title="Needs triage" hint="New reports nobody has acknowledged yet — biggest first." items={triage.untriaged} cats={cats} />
        <Queue title="Overdue" hint="Past the category's target time." items={triage.overdue} cats={cats} />
        <Queue title="Awaiting reporter confirmation" hint="Auto-closes 7 days after being marked fixed." items={triage.awaiting} cats={cats} />
        {isAdmin && (
          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <div className="font-semibold">Moderation queue</div>
              <div className="text-xs text-ink-muted">Content flagged by the community. 5 flags hide it automatically until reviewed.</div>
            </div>
            {flags.length === 0 ? (
              <EmptyState title="Nothing flagged" />
            ) : (
              <ul className="divide-y divide-line">
                {flags.map((f) => (
                  <li key={`${f.target_type}-${f.target_id}`} className="px-5 py-3.5">
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span className="rounded bg-warn-soft px-1.5 py-0.5 font-semibold text-warn">{f.flags} flags</span>
                      {f.target_type === "comment" ? "Comment on" : "Issue"}{" "}
                      <Link href={`/issues/${f.issue_number}`} className="font-semibold text-brand hover:underline">
                        #{f.issue_number}
                      </Link>
                      {f.hidden && <span className="font-semibold text-danger">hidden</span>}
                    </div>
                    <p className="mt-1 text-sm">{f.excerpt}</p>
                    <div className="mt-1 text-xs text-ink-muted">{f.reasons.join(" · ")}</div>
                    <FlagActions targetType={f.target_type} targetId={f.target_id} hidden={f.hidden} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Count({ icon: I, label, value, tone }: { icon: typeof Inbox; label: string; value: number; tone?: "danger" | "ok" | "warn" }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-xl",
          tone === "danger" ? "bg-danger-soft text-danger" : tone === "ok" ? "bg-ok-soft text-ok" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand",
        )}
      >
        <I size={18} />
      </span>
      <div>
        <div className="font-display text-2xl leading-none tabular">{value}</div>
        <div className="mt-1 text-xs text-ink-muted">{label}</div>
      </div>
    </div>
  );
}

function Queue({ title, hint, items, cats }: { title: string; hint: string; items: QueueItem[]; cats: Map<string, { icon: string; color: string; name: string }> }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3.5">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-ink-muted">{hint}</div>
      </div>
      {items.length === 0 ? (
        <EmptyState title="All clear" />
      ) : (
        <ul className="max-h-[440px] divide-y divide-line overflow-y-auto">
          {items.map((i) => {
            const c = cats.get(i.category_id);
            return (
              <li key={i.id}>
                <Link href={`/issues/${i.number}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="font-display w-9 shrink-0 text-center text-lg tabular" title="People affected">
                    {i.metoo_count}
                  </span>
                  {c && <CategoryIcon icon={c.icon} color={c.color} size={14} boxed />}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium">{i.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                      #{i.number} · <span suppressHydrationWarning>{timeAgo(new Date(i.created_at))}</span>
                      {i.severity === "high" && <span className="font-semibold text-danger">urgent</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill status={i.status} short />
                    <SlaChip dueAt={new Date(i.due_at).toISOString()} status={i.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
