import { ArrowLeft, Building2, CalendarRange, Check, EyeOff, FileText, FlaskConical, HandHeart, Megaphone, MessageSquare, Sparkles, Target, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breakdown, GrowthChart, Pipeline, StagePill } from "@/components/proposal-ui";
import { ApprovalBanner, ApprovalTag, ReviewActions } from "@/components/review";
import { LiveRefresh } from "@/components/shell";
import { Avatar, buttonClass } from "@/components/ui";
import { AREA_LABEL, STAGE_META, TRIAL_RATINGS, USAGE_META } from "@/lib/constants";
import { cn, timeAgo } from "@/lib/format";
import { requireViewerPage } from "@/server/dal";
import { getProposalDetail, getViewerCohort, type ProposalDetail } from "@/server/proposal-queries";
import { getTaxonomy } from "@/server/queries";
import { CheckInCard, HidePostButton, MovePanel, PostComposer, ShareButton, SupportPanel } from "./proposal-client";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Proposal P-${(await params).number}` };
}

const fmtDay = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");

export default async function ProposalPage({ params }: { params: Promise<{ number: string }> }) {
  const viewer = await requireViewerPage();
  const n = Number((await params).number);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) notFound();
  const [p, tax, cohort] = await Promise.all([getProposalDetail(viewer, n), getTaxonomy(), getViewerCohort(viewer)]);
  if (!p) notFound();
  const ev = p.evidence;
  const total = p.supportCount;

  return (
    <div className="space-y-5">
      <LiveRefresh seconds={60} />
      <Link href="/proposals" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Proposals
      </Link>

      <ApprovalBanner kind="proposal" id={p.id} approval={p.approval} hidden={p.hidden} reason={p.hiddenReason} canReview={p.viewerIsMod} mine={p.viewerIsAuthor} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0 space-y-5">
          <div className="card p-5 sm:p-7 animate-rise">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="font-semibold text-brand">{AREA_LABEL[p.area] ?? p.area}</span>
              <span className="text-ink-muted tabular">P-{p.number}</span>
              <StagePill stage={p.stage} />
            </div>
            <h1 className="font-display mt-3 text-[28px] leading-[1.15] tracking-tight sm:text-[36px]">{p.title}</h1>
            <div className="mt-4 rounded-2xl bg-brand-soft p-4">
              <div className="flex items-center gap-1.5 text-[13px] text-brand">
                <Target size={13} /> The ask
              </div>
              <p className="mt-1.5 text-[16px] font-medium leading-relaxed">{p.ask}</p>
            </div>
            <div className="mt-5 flex items-center gap-2.5 text-sm text-ink-muted">
              <Avatar name={p.author.name} image={p.author.image} size={26} />
              <span>
                Proposed by <b className="text-ink">{p.viewerIsAuthor ? "you" : p.author.name}</b>
                {p.author.cohort && ` · ${p.author.cohort}`} · <span suppressHydrationWarning>{timeAgo(p.createdAt)}</span>
              </span>
            </div>
            {p.body && <p className="mt-5 whitespace-pre-wrap text-[15.5px] leading-relaxed text-ink-2">{p.body}</p>}
            {p.photos.length > 0 && (
              <div className={cn("mt-5 grid gap-2", p.photos.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
                {p.photos.map((id) => (
                  <a key={id} href={`/api/attachments/${id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/attachments/${id}`} alt="" className={cn("w-full object-cover", p.photos.length === 1 ? "max-h-[420px]" : "aspect-square")} loading="lazy" />
                  </a>
                ))}
              </div>
            )}
            {p.trialPlan && p.stage !== "trial" && (
              <div className="mt-5 rounded-2xl bg-surface-2 p-4">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <FlaskConical size={15} className="text-brand" /> How a trial could work
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{p.trialPlan}</p>
              </div>
            )}
          </div>

          <div className="card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Where this stands</h2>
              <span className="text-xs text-ink-muted" suppressHydrationWarning>
                {STAGE_META[p.stage].hint} · since {timeAgo(p.stageChangedAt)}
              </span>
            </div>
            <Pipeline stage={p.stage} />
          </div>

          {p.stage === "trial" && <TrialCard p={p} />}
          <CheckInCard proposalId={p.id} checkedIn={p.viewerCheckedInToday} live={p.trialLive} />

          {(p.stage === "adopted" || p.stage === "declined" || p.stage === "withdrawn") && p.decisionNote && (
            <div className={cn("card overflow-hidden", p.stage === "adopted" && "border-[color-mix(in_srgb,var(--ok)_35%,transparent)]")}>
              <div className={cn("flex items-center gap-2 px-5 py-3 text-sm font-semibold", p.stage === "adopted" ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2")}>
                {p.stage === "adopted" ? <Check size={17} strokeWidth={3} /> : <FileText size={16} />}
                {p.stage === "adopted" ? "Adopted" : p.stage === "declined" ? "Not approved" : "Withdrawn"}
                {p.departmentName && p.stage !== "withdrawn" && <span className="font-medium"> · {p.departmentName}</span>}
              </div>
              <p className="whitespace-pre-wrap px-5 py-4 text-[15px] leading-relaxed">{p.decisionNote}</p>
            </div>
          )}

          {/* Evidence */}
          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Sparkles size={17} className="text-brand" /> The evidence so far
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">Every supporter is a signed-in Plaksha account. One person, one count.</p>
              </div>
              <Link href={`/proposals/${p.number}/evidence`} className={buttonClass("secondary", "sm")}>
                <FileText size={14} /> Evidence pack
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Figure icon={Users} value={total} label="supporters" />
              <Figure icon={CalendarRange} value={ev.usage.often} label="would use it weekly" />
              <Figure icon={HandHeart} value={ev.volunteers} label="volunteered to help" />
            </div>

            <div className="mt-6">
              <div className="mb-1 text-[13px] text-ink-muted">Support over time</div>
              <GrowthChart points={ev.growth} goal={p.goal} />
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-2.5 text-[13px] text-ink-muted">Who wants it</div>
                <Breakdown total={total} rows={ev.cohorts.map((c) => ({ label: c.cohort, n: c.n }))} />
              </div>
              <div>
                <div className="mb-2.5 text-[13px] text-ink-muted">How they&apos;d use it</div>
                <Breakdown
                  total={total}
                  rows={[
                    { label: USAGE_META.often.short, n: ev.usage.often, tone: "bg-mint" },
                    { label: USAGE_META.sometimes.short, n: ev.usage.sometimes, tone: "bg-aqua" },
                    { label: USAGE_META.backing.short, n: ev.usage.backing, tone: "bg-line-strong" },
                  ]}
                />
              </div>
            </div>

            {ev.reasons.length > 0 && (
              <div className="mt-6">
                <div className="mb-2.5 text-[13px] text-ink-muted">In their words</div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ev.reasons.slice(0, 8).map((r, i) => (
                    <li key={i} className="rounded-xl bg-surface-2 p-3 text-sm">
                      <p className="leading-relaxed">“{r.reason}”</p>
                      <div className="mt-1.5 text-xs text-ink-muted">
                        {r.who}
                        {r.cohort && ` · ${r.cohort}`}
                      </div>
                    </li>
                  ))}
                </ul>
                {ev.reasons.length > 8 && (
                  <Link href={`/proposals/${p.number}/evidence`} className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">
                    All {ev.reasons.length} in the evidence pack →
                  </Link>
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              Timeline & discussion <span className="text-sm font-normal text-ink-muted">· every step, permanently</span>
            </h2>
            <ol className="relative space-y-3 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-line-strong">
              {p.posts.map((t) => (
                <Post key={t.id} t={t} isMod={p.viewerIsMod} dept={p.departmentName} />
              ))}
            </ol>
          </section>
          <PostComposer
            proposalId={p.id}
            canUpdate={p.viewerIsAuthor || p.viewerCanDecide}
            updateLabel={p.viewerCanDecide && !p.viewerIsAuthor ? `Post as ${p.departmentName ?? "the office"}` : "Post as a progress update"}
          />
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <SupportPanel proposalId={p.id} count={p.supportCount} goal={p.goal} support={p.viewerSupport} cohort={cohort} open={p.open} isAuthor={p.viewerIsAuthor} />
          {p.open && !p.hidden && <ShareButton title={p.title} count={p.supportCount} />}
          <div className="card p-4">
            <dl className="space-y-2.5 text-sm">
              <Fact icon={Building2} label="Office" value={p.departmentName ?? "Not assigned yet"} />
              <Fact icon={Target} label="Goal" value={`${p.goal} supporters`} />
              <Fact icon={MessageSquare} label="Discussion" value={`${p.commentCount} ${p.commentCount === 1 ? "comment" : "comments"}`} />
            </dl>
          </div>
          {(p.viewerIsAuthor || p.viewerCanDecide || p.viewerIsMod) && p.approval === "approved" && (
            <MovePanel
              proposalId={p.id}
              stage={p.stage}
              canDecide={p.viewerCanDecide}
              isAuthor={p.viewerIsAuthor}
              isAdmin={p.viewerIsMod}
              hidden={p.hidden}
              departmentId={p.departmentId}
              departments={tax.departments.map((d) => ({ id: d.id, name: d.name }))}
              trialPlan={p.trialPlan}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Figure({ icon: I, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5">
      <I size={16} className="text-brand" />
      <div className="font-display mt-2 text-[28px] leading-none tabular">{value}</div>
      <div className="mt-1 text-xs leading-snug text-ink-muted">{label}</div>
    </div>
  );
}

function Fact({ icon: I, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="inline-flex items-center gap-2 text-ink-muted">
        <I size={15} /> {label}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function TrialCard({ p }: { p: ProposalDetail }) {
  const t = p.evidence.trial;
  const max = Math.max(1, ...t.days.map((d) => d.n));
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FlaskConical size={17} className="text-brand" /> Trial run
        </h2>
        <span className="text-sm text-ink-muted">
          {fmtDay(p.trialStartsOn)} – {fmtDay(p.trialEndsOn)}
          {!p.trialLive && p.trialEndsOn && p.today > p.trialEndsOn && <span className="ml-2 font-medium text-accent-ink">· Ended, waiting for the office&apos;s decision</span>}
          {!p.trialLive && p.trialStartsOn && p.today < p.trialStartsOn && <span className="ml-2 font-medium text-ink-2">· Starts soon</span>}
        </span>
      </div>
      {p.trialPlan && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{p.trialPlan}</p>}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Figure icon={Check} value={t.total} label="check-ins" />
        <Figure icon={Users} value={t.people} label="different people" />
        <Figure icon={Sparkles} value={t.total ? Math.round((t.good / t.total) * 100) : 0} label="% said it worked well" />
      </div>
      {t.days.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[13px] text-ink-muted">Check-ins per day</div>
          <div className="flex h-20 items-end gap-1.5">
            {t.days.map((d) => (
              <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${fmtDay(d.day)}: ${d.n} check-ins`}>
                <span className="text-[10px] tabular text-ink-muted">{d.n}</span>
                <div className="w-full rounded-t-md bg-mint" style={{ height: `${(d.n / max) * 52 + 4}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
            <span>{fmtDay(t.days[0]!.day)}</span>
            <span>{fmtDay(t.days[t.days.length - 1]!.day)}</span>
          </div>
        </div>
      )}
      {t.total > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span>
            <b className="text-ok">{t.good}</b> {TRIAL_RATINGS[3].label.toLowerCase()}
          </span>
          <span>
            <b className="text-warn">{t.ok}</b> {TRIAL_RATINGS[2].label.toLowerCase()}
          </span>
          <span>
            <b className="text-danger">{t.bad}</b> {TRIAL_RATINGS[1].label.toLowerCase()}
          </span>
        </div>
      )}
    </div>
  );
}

function Post({ t, isMod, dept }: { t: ProposalDetail["posts"][number]; isMod: boolean; dept: string | null }) {
  const system = t.kind === "created" || t.kind === "stage";
  const who = t.official ? (t.office ?? dept ?? "The office") : (t.author?.name ?? "Someone");
  return (
    <li className={cn("relative flex gap-3", t.hidden && t.approval !== "pending" && "opacity-50")}>
      <span
        className={cn(
          "z-10 mt-0.5 inline-flex size-[31px] shrink-0 items-center justify-center rounded-full ring-4 ring-bg",
          system ? "bg-mint text-brand-ink" : t.kind === "update" ? "bg-accent text-[#3a2a00]" : "bg-surface-3 text-ink-muted",
        )}
      >
        {t.kind === "created" ? <Sparkles size={14} /> : t.kind === "stage" ? <Check size={14} strokeWidth={3} /> : t.kind === "update" ? <Megaphone size={14} /> : <MessageSquare size={13} />}
      </span>
      <div className={cn("min-w-0 flex-1", !system && "card p-3.5", t.kind === "update" && "border-[color-mix(in_srgb,var(--accent)_55%,transparent)]")}>
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <b>{who}</b>
          {t.official && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">Official</span>}
          {!t.official && t.byAuthor && !system && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">Proposer</span>}
          <span className="text-ink-muted">
            {t.kind === "created" && "proposed this"}
            {t.kind === "stage" && t.toStage && (
              <>
                moved it to <b className="text-ink">{STAGE_META[t.toStage].label}</b>
              </>
            )}
            {t.kind === "update" && "posted an update"}
          </span>
          <span className="text-xs text-ink-muted" suppressHydrationWarning>
            · {timeAgo(t.createdAt)}
          </span>
          <ApprovalTag approval={t.approval} />
          {isMod && !system && t.approval !== "pending" && (
            <span className="ml-auto">
              <HidePostButton postId={t.id} hidden={t.hidden} />
            </span>
          )}
        </div>
        {t.body && <p className={cn("whitespace-pre-wrap text-[14.5px] leading-relaxed", system ? "mt-1 text-ink-2" : "mt-1.5")}>{t.body}</p>}
        {isMod && t.approval === "pending" && <ReviewActions kind="post" id={t.id} className="mt-3" />}
      </div>
    </li>
  );
}
