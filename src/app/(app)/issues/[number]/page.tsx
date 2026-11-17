import { ArrowLeft, Building2, CheckCircle2, CircleDot, Clock, EyeOff, GitMerge, MapPin, RotateCcw, ShieldCheck, Timer, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/shell";
import { MetooButton } from "@/components/metoo-button";
import { ApprovalBanner, ApprovalTag, ReviewActions } from "@/components/review";
import { Avatar, CategoryIcon, SlaChip, StatusPill } from "@/components/ui";
import { ACTIVE_STATUSES, SEVERITY_META, STATUS_META } from "@/lib/constants";
import { cn, duration, hoursBetween, timeAgo } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getIssueDetail, getTaxonomy, type IssueDetail, type TimelineItem } from "@/server/queries";
import { CommentComposer, FlagButton, HideCommentButton, ManagePanel, NewIssueToast, VerifyCard, WatchButton } from "./issue-client";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `#${(await params).number}` };
}

export default async function IssuePage({ params }: { params: Promise<{ number: string }> }) {
  const viewer = await requireViewerPage();
  const n = Number((await params).number);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const [issue, tax] = await Promise.all([getIssueDetail(viewer, n), getTaxonomy()]);
  if (!issue) notFound();

  const active = ACTIVE_STATUSES.includes(issue.status);
  const fixedIn = issue.resolvedAt ? hoursBetween(issue.createdAt, issue.resolvedAt) : null;
  const onTime = issue.resolvedAt ? new Date(issue.resolvedAt) <= new Date(issue.dueAt) : null;

  return (
    <div className="space-y-5">
      <LiveRefresh seconds={30} />
      <NewIssueToast metooCount={issue.metooCount} pending={issue.approval === "pending"} />
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Board
      </Link>

      <ApprovalBanner kind="issue" id={issue.id} approval={issue.approval} hidden={issue.hidden} reason={issue.hiddenReason} canReview={issue.viewerIsMod} mine={issue.viewerIsReporter} />
      {issue.duplicateOf && (
        <Link
          href={`/issues/${issue.duplicateOf.number}`}
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-sm hover:border-brand"
        >
          <GitMerge size={18} className="text-brand" />
          <span>
            Merged into <b>#{issue.duplicateOf.number}</b> {issue.duplicateOf.title} — your me-too moved with it.
          </span>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0 space-y-5">
          <div className="card p-5 sm:p-7 animate-rise">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                <CategoryIcon icon={issue.category.icon} color={issue.category.color} size={15} /> {issue.category.name}
              </span>
              {issue.location && (
                <span className="inline-flex items-center gap-1 text-ink-muted">
                  <MapPin size={14} /> {issue.location.name}
                  {issue.locationDetail && ` · ${issue.locationDetail}`}
                </span>
              )}
              <span className="text-ink-muted tabular">#{issue.number}</span>
            </div>
            <h1 className="font-display mt-3 text-[28px] leading-[1.15] tracking-tight sm:text-[34px]">{issue.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={issue.status} />
              {issue.approval === "approved" && <SlaChip dueAt={issue.dueAt} status={issue.status} />}
              {issue.severity === "high" && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">{SEVERITY_META.high.label}</span>}
              {issue.reopenCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
                  <RotateCcw size={11} /> Reopened {issue.reopenCount}×
                </span>
              )}
            </div>
            <div className="mt-5 flex items-center gap-2.5 text-sm text-ink-muted">
              {issue.reporter ? <Avatar name={issue.reporter.name} image={issue.reporter.image} size={26} /> : <AnonAvatar />}
              <span>
                {issue.reporter ? <b className="text-ink">{issue.viewerIsReporter ? "You" : issue.reporter.name}</b> : <b className="text-ink">Anonymous Plaksha member</b>}
                {issue.anonymous && issue.reporter && (
                  <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium">
                    {issue.viewerIsReporter ? "posted anonymously" : "anonymous to others"}
                  </span>
                )}
                {issue.reporterEmail && issue.anonymous && <span className="ml-1.5 text-xs">({issue.reporterEmail})</span>} · reported{" "}
                <span suppressHydrationWarning>{timeAgo(issue.createdAt)}</span>
              </span>
            </div>
            {issue.body && <p className="mt-5 whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink-2">{issue.body}</p>}
            {issue.photos.length > 0 && <Photos ids={issue.photos.map((p) => p.id)} />}
            <div className="mt-5 flex items-center justify-end border-t border-line pt-3">
              {!issue.viewerIsReporter && <FlagButton targetType="issue" targetId={issue.id} />}
            </div>
          </div>

          {(issue.status === "resolved" || issue.status === "closed") && issue.resolutionNote && (
            <div className="card overflow-hidden border-[color-mix(in_srgb,var(--ok)_35%,transparent)]">
              <div className="flex flex-wrap items-center gap-2 bg-ok-soft px-5 py-3 text-sm font-semibold text-ok">
                <CheckCircle2 size={17} /> {issue.status === "closed" ? "Verified fixed" : "Marked fixed"} by {issue.department.name}
                <span className="ml-auto font-medium text-ink-2">
                  Took {duration(fixedIn)} ·{" "}
                  <span className={onTime ? "text-ok" : "text-warn"}>{onTime ? "on time" : "past target"}</span>
                </span>
              </div>
              <div className="px-5 py-4">
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{issue.resolutionNote}</p>
                {issue.resolutionPhotos.length > 0 && <Photos ids={issue.resolutionPhotos.map((p) => p.id)} label="After" />}
              </div>
            </div>
          )}
          {issue.status === "wont_fix" && issue.wontFixReason && (
            <div className="card p-5">
              <div className="text-sm font-semibold text-ink-muted">Closed without a fix — {issue.department.name} explained:</div>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{issue.wontFixReason}</p>
            </div>
          )}

          {issue.status === "resolved" && (
            <VerifyCard
              issueId={issue.id}
              fixed={issue.verification.fixed}
              broken={issue.verification.broken}
              viewer={issue.verification.viewer}
              eligible={issue.verification.viewerEligible}
            />
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              Public timeline <span className="text-sm font-normal text-ink-muted">· every change, permanently</span>
            </h2>
            <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-line-strong">
              {issue.timeline.map((t) => (
                <TimelineEntry key={t.id} item={t} canModerate={issue.viewerIsMod} />
              ))}
            </ol>
          </section>

          {issue.status !== "duplicate" && !issue.hidden && (
            <CommentComposer issueId={issue.id} canOfficial={issue.viewerCanManage} departmentName={issue.department.name} closed={!active} />
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <MetooButton issueId={issue.id} count={issue.metooCount} voted={issue.viewerVoted} disabled={!active || issue.hidden} size="lg" isReporter={issue.viewerIsReporter} />
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-ink-muted">Progress</div>
              <WatchButton issueId={issue.id} watching={issue.viewerWatching} />
            </div>
            <Progress issue={issue} />
            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
              <Fact icon={Building2} label="Owner" value={issue.department.name} />
              <Fact icon={Timer} label="Target" value={`${duration(issue.category.slaHours)} · ${new Date(issue.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`} />
              <Fact icon={Users} label="Affected" value={`${issue.metooCount} ${issue.metooCount === 1 ? "person" : "people"}`} />
              {issue.mergedChildren.length > 0 && <Fact icon={GitMerge} label="Merged in" value={issue.mergedChildren.map((c) => `#${c.number}`).join(", ")} />}
            </dl>
          </div>
          {issue.viewerCanManage && (
            <ManagePanel
              issueId={issue.id}
              status={issue.status}
              departmentId={issue.department.id}
              departments={tax.departments.map((d) => ({ id: d.id, name: d.name }))}
              isAdmin={issue.viewerIsAdmin}
              hidden={issue.hidden}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function AnonAvatar() {
  return (
    <span className="inline-flex size-[26px] items-center justify-center rounded-full bg-surface-3 text-ink-muted">
      <EyeOff size={13} />
    </span>
  );
}

function Photos({ ids, label }: { ids: string[]; label?: string }) {
  return (
    <div className={cn("mt-5 grid gap-2", ids.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
      {ids.map((id) => (
        <a key={id} href={`/api/attachments/${id}`} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/attachments/${id}`} alt="" className={cn("w-full object-cover", ids.length === 1 ? "max-h-[420px]" : "aspect-square")} loading="lazy" />
          {label && <span className="absolute left-2 top-2 rounded-full bg-ok px-2 py-0.5 text-[11px] font-semibold text-white">{label}</span>}
        </a>
      ))}
    </div>
  );
}

function Fact({ icon: I, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <I size={15} className="shrink-0 text-ink-muted" />
      <dt className="text-ink-muted">{label}</dt>
      <dd className="ml-auto text-right font-medium">{value}</dd>
    </div>
  );
}

function Progress({ issue }: { issue: IssueDetail }) {
  const steps = [
    { key: "open", label: "Reported", at: issue.createdAt },
    { key: "acknowledged", label: "Acknowledged", at: issue.acknowledgedAt },
    { key: "in_progress", label: "In progress", at: issue.acknowledgedAt && issue.status !== "acknowledged" && issue.status !== "open" ? issue.acknowledgedAt : null },
    { key: "resolved", label: "Marked fixed", at: issue.resolvedAt },
    { key: "closed", label: "Verified by reporters", at: issue.status === "closed" ? issue.closedAt : null },
  ];
  const order = ["open", "acknowledged", "in_progress", "resolved", "closed"];
  const idx = order.indexOf(issue.status);
  if (idx < 0)
    return (
      <div className="mt-3 text-sm text-ink-muted">
        {STATUS_META[issue.status].label}
        {issue.closedAt && <span suppressHydrationWarning> · {timeAgo(issue.closedAt)}</span>}
      </div>
    );
  return (
    <ol className="mt-3 space-y-0">
      {steps.map((s, i) => {
        const done = i <= idx;
        const current = i === idx;
        return (
          <li key={s.key} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && <span className={cn("absolute left-[9px] top-5 h-[calc(100%-14px)] w-0.5", i < idx ? "bg-mint" : "bg-line")} />}
            <span
              className={cn(
                "relative z-10 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full",
                done ? "bg-mint text-brand-ink" : "bg-surface-3",
                current && "ring-4 ring-brand/20",
              )}
            >
              {done && <CheckCircle2 size={12} strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm", done ? "font-semibold" : "text-ink-muted")}>{s.label}</span>
              {done && s.at && (
                <span className="block text-xs text-ink-muted" suppressHydrationWarning>
                  {timeAgo(s.at)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TimelineEntry({ item, canModerate }: { item: TimelineItem; canModerate: boolean }) {
  if (item.kind === "comment") {
    return (
      <li className="relative flex gap-3 animate-rise">
        <span className="relative z-10 shrink-0">
          {item.official ? (
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-mint text-brand-ink ring-4 ring-bg">
              <ShieldCheck size={15} />
            </span>
          ) : item.authorImage !== null || item.author !== "Anonymous Plaksha member" ? (
            <Avatar name={item.author} image={item.authorImage} size={32} className="ring-4 ring-bg" />
          ) : (
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-surface-3 text-ink-muted ring-4 ring-bg">
              <EyeOff size={14} />
            </span>
          )}
        </span>
        <div className={cn("card min-w-0 flex-1 px-4 py-3", item.official && "border-[color-mix(in_srgb,var(--brand)_40%,transparent)] bg-brand-soft/40", item.hidden && item.approval !== "pending" && "opacity-60")}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <b>{item.author}</b>
            {item.official && <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-medium text-brand-ink">Official</span>}
            {item.realAuthor && <span className="text-xs text-ink-muted">({item.realAuthor})</span>}
            <span className="text-xs text-ink-muted" suppressHydrationWarning>
              {timeAgo(item.createdAt)}
            </span>
            <ApprovalTag approval={item.approval} />
            {item.hidden && item.approval === "approved" && <span className="text-xs font-medium text-danger">hidden</span>}
            <span className="ml-auto flex items-center gap-3">
              {canModerate && item.approval !== "pending" && <HideCommentButton commentId={item.id} hidden={item.hidden} />}
              {!item.mine && !item.hidden && <FlagButton targetType="comment" targetId={item.id} compact />}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{item.body}</p>
          {canModerate && item.approval === "pending" && <ReviewActions kind="comment" id={item.id} className="mt-3" />}
        </div>
      </li>
    );
  }

  const text = (() => {
    switch (item.type) {
      case "created":
        return <>Reported</>;
      case "status_changed":
        return (
          <>
            <b>{item.actor}</b> moved this to <b>{item.toStatus ? STATUS_META[item.toStatus].label : "?"}</b>
          </>
        );
      case "reopened":
        return (
          <>
            <b>{item.actor}</b> reopened this — still not fixed
          </>
        );
      case "verified":
        return item.actor === "Pulse" ? (
          <>Auto-closed: nobody reported it still broken</>
        ) : (
          <>
            <b>{item.actor}</b> confirmed it&apos;s fixed
          </>
        );
      case "reassigned":
        return (
          <>
            <b>{item.actor}</b> took ownership
          </>
        );
      case "merged_in":
        return (
          <>
            <b>{item.actor}</b> merged duplicate <Link href={`/issues/${item.relatedNumber}`} className="font-semibold text-brand hover:underline">#{item.relatedNumber}</Link> into this — its me-toos now count here
          </>
        );
      case "merged_away":
        return (
          <>
            <b>{item.actor}</b> merged this into <Link href={`/issues/${item.relatedNumber}`} className="font-semibold text-brand hover:underline">#{item.relatedNumber}</Link>
          </>
        );
      case "hidden":
        return <>Hidden by a moderator</>;
      case "restored":
        return <>Restored by a moderator</>;
      default:
        return <>Edited</>;
    }
  })();
  const tone =
    item.toStatus === "closed" || item.type === "verified"
      ? "bg-ok text-white"
      : item.type === "reopened"
        ? "bg-warn text-white"
        : item.toStatus === "resolved"
          ? "bg-accent text-[#3a2a00]"
          : item.type === "created"
            ? "bg-ink text-bg"
            : "bg-surface-3 text-ink-2";
  return (
    <li className="relative flex items-start gap-3">
      <span className={cn("relative z-10 mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-bg", tone)}>
        {item.type === "reopened" ? <RotateCcw size={14} /> : item.type.startsWith("merged") ? <GitMerge size={14} /> : item.toStatus === "closed" || item.type === "verified" ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
      </span>
      <div className="min-w-0 flex-1 pt-1.5 text-sm">
        <span className="text-ink-2">{text}</span>{" "}
        <span className="text-xs text-ink-muted" suppressHydrationWarning>
          · {timeAgo(item.createdAt)}
        </span>
        {item.note && item.type !== "created" && <p className="mt-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[14px] leading-relaxed text-ink-2">{item.note}</p>}
      </div>
    </li>
  );
}
