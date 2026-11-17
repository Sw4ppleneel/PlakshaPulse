import { AlertTriangle, CheckCircle2, Inbox, Users } from "lucide-react";
import Link from "next/link";
import { Stagger, StaggerItem } from "@/components/motion";
import { ReviewActions } from "@/components/review";
import { LiveRefresh } from "@/components/shell";
import { CategoryIcon, EmptyState, PageHeader, SlaChip, StatusPill, buttonClass } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import { getFlagQueue, getHiddenContent, getModerationLog, getReviewQueue, getTriage, type QueueItem } from "@/server/admin-queries";
import { isMod, isStaffish, requireViewerPage } from "@/server/dal";
import { getTaxonomy } from "@/server/queries";
import { notFound } from "next/navigation";
import { FlagActions } from "./flag-actions";
import { RestoreButton } from "./restore-button";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const viewer = await requireViewerPage();
  const mod = isMod(viewer);
  if (!isStaffish(viewer) && !mod) notFound();
  const isAdmin = viewer.role === "admin";
  const triages = isStaffish(viewer);
  const [triage, flags, review, hidden, log, tax] = await Promise.all([
    triages ? getTriage(viewer) : Promise.resolve({ untriaged: [], overdue: [], awaiting: [] }),
    mod ? getFlagQueue() : Promise.resolve([]),
    mod ? getReviewQueue(viewer) : Promise.resolve([]),
    mod ? getHiddenContent() : Promise.resolve([]),
    mod ? getModerationLog(viewer) : Promise.resolve([]),
    getTaxonomy(),
  ]);
  const cats = new Map(tax.categories.map((c) => [c.id, c]));
  const deptName = tax.departments.find((d) => d.id === viewer.departmentId)?.name;

  return (
    <div className="space-y-6">
      <LiveRefresh seconds={30} />
      <PageHeader
        title={isAdmin ? "Admin" : mod ? "Moderation" : `${deptName ?? "Department"} queue`}
        sub={
          mod
            ? review.length === 0
              ? "Nothing is waiting for approval."
              : `${review.length} ${review.length === 1 ? "post is" : "posts are"} waiting for approval. Nothing from members is public until one of you approves it.`
            : "Issues routed to your office. Everything you post here is public on the issue."
        }
        action={
          isAdmin && (
            <Link href="/admin/people" className={buttonClass("secondary", "md", "bg-surface shadow-card")}>
              <Users size={16} aria-hidden /> People & roles
            </Link>
          )
        }
      />

      {mod && (
        <section className="card p-2">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <h2 className="text-base font-semibold">Waiting for approval</h2>
            {review.length > 0 && <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-mint px-2 text-xs font-semibold text-brand-ink tabular">{review.length}</span>}
          </div>
          {review.length === 0 ? (
            <EmptyState title="All caught up" icon={<CheckCircle2 size={24} strokeWidth={1.75} />}>
              New reports, proposals and comments from members appear here before anyone else can see them.
            </EmptyState>
          ) : (
            <Stagger as="ul">
              {review.map((r) => (
                <StaggerItem as="li" key={`${r.kind}-${r.id}`} className="rounded-[22px] px-4 py-4 transition-colors hover:bg-surface-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
                    <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-ink-2">{KIND_LABEL[r.kind]}</span>
                    {r.context && (
                      <Link href={r.href} className="min-w-0 truncate font-medium text-ink-2 hover:underline">
                        on {r.context}
                      </Link>
                    )}
                    <span>{r.author ?? "Posted anonymously"}</span>
                    <span suppressHydrationWarning>· {timeAgo(r.createdAt)}</span>
                    {r.photos > 0 && (
                      <span>
                        · {r.photos} {r.photos === 1 ? "photo" : "photos"}
                      </span>
                    )}
                  </div>
                  {r.title && (
                    <Link href={r.href} className="mt-2 block text-[17px] font-semibold leading-snug tracking-tight hover:underline">
                      {r.title}
                    </Link>
                  )}
                  {r.text && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{r.text}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <ReviewActions kind={r.kind} id={r.id} className="min-w-0 flex-1" />
                    {(r.kind === "issue" || r.kind === "proposal") && (
                      <Link href={r.href} className="text-[13px] font-medium text-ink-muted hover:text-ink">
                        Open in full
                      </Link>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </section>
      )}

      {triages && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Count icon={Inbox} label="Needs triage" value={triage.untriaged.length} />
          <Count icon={AlertTriangle} label="Overdue" value={triage.overdue.length} tone="danger" />
          <Count icon={CheckCircle2} label="Awaiting confirmation" value={triage.awaiting.length} tone="ok" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {triages && (
          <>
            <Queue title="Needs triage" hint="New reports nobody has acknowledged yet — biggest first." items={triage.untriaged} cats={cats} />
            <Queue title="Overdue" hint="Past the category's target time." items={triage.overdue} cats={cats} />
            <Queue title="Awaiting reporter confirmation" hint="Auto-closes 7 days after being marked fixed." items={triage.awaiting} cats={cats} />
          </>
        )}
        {mod && (
          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <div className="font-semibold">Flagged by the community</div>
              <div className="text-xs text-ink-muted">Already-public content that people reported. 5 flags hide it automatically until reviewed.</div>
            </div>
            {flags.length === 0 ? (
              <EmptyState title="Nothing flagged" />
            ) : (
              <ul className="divide-y divide-line">
                {flags.map((f) => (
                  <li key={`${f.target_type}-${f.target_id}`} className="px-5 py-3.5">
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">{f.flags} flags</span>
                      {f.target_type === "comment" ? "Comment on" : "Issue"}{" "}
                      <Link href={`/issues/${f.issue_number}`} className="font-semibold text-brand hover:underline">
                        #{f.issue_number}
                      </Link>
                      {f.hidden && <span className="font-medium text-danger">hidden</span>}
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

      {mod && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section id="hidden" className="card p-2">
            <div className="px-4 pb-1 pt-3">
              <h2 className="text-base font-semibold">Hidden and rejected</h2>
              <p className="text-[13px] text-ink-muted">Only moderators and each author can see these. Restore makes one public again.</p>
            </div>
            {hidden.length === 0 ? (
              <EmptyState title="Nothing hidden" />
            ) : (
              <ul className="max-h-[520px] overflow-y-auto">
                {hidden.map((h) => (
                  <li key={`${h.kind}-${h.id}`} className="flex items-start gap-3 rounded-[22px] px-4 py-3.5 transition-colors hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
                        <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", h.state === "rejected" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-2")}>
                          {h.state === "rejected" ? "Rejected" : "Hidden"} {h.kind}
                        </span>
                        <span>{h.author}</span>
                        <span suppressHydrationWarning>· {timeAgo(h.at)}</span>
                      </div>
                      <Link href={h.href} className="mt-1.5 line-clamp-2 block text-sm font-medium leading-snug hover:underline">
                        {h.title}
                      </Link>
                      {h.context && <div className="mt-0.5 truncate text-xs text-ink-muted">on {h.context}</div>}
                      {h.reason && <div className="mt-0.5 text-xs text-ink-muted">Reason: {h.reason}</div>}
                    </div>
                    <RestoreButton kind={h.kind} id={h.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="log" className="card p-2">
            <div className="px-4 pb-1 pt-3">
              <h2 className="text-base font-semibold">Moderation log</h2>
              <p className="text-[13px] text-ink-muted">
                Every approve, reject, hide and restore{isAdmin ? ", and every role change and suspension" : ""}. Private to {isAdmin ? "admins and moderators" : "moderators"}.
              </p>
            </div>
            {log.length === 0 ? (
              <EmptyState title="No actions yet" />
            ) : (
              <ol className="max-h-[520px] overflow-y-auto px-2 pb-2">
                {log.map((l) => (
                  <li key={l.id} className="flex gap-3 rounded-2xl px-2 py-2.5 text-sm">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-muted/50" aria-hidden />
                    <div className="min-w-0">
                      <span className="font-medium">{l.actor}</span>{" "}
                      {l.href ? (
                        <Link href={l.href} className="text-ink-2 hover:underline">
                          {l.text}
                        </Link>
                      ) : (
                        <span className="text-ink-2">{l.text}</span>
                      )}
                      <div className="text-xs text-ink-muted">
                        <span suppressHydrationWarning>{new Date(l.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                        {l.note && <> · {l.note}</>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = { issue: "New issue", proposal: "New proposal", comment: "Comment", post: "Proposal post", reason: "Support reason" } as const;

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
