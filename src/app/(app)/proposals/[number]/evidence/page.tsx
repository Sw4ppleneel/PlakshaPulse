import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breakdown, GrowthChart } from "@/components/proposal-ui";
import { AREA_LABEL, STAGE_META, TRIAL_RATINGS, USAGE_META } from "@/lib/constants";
import { env } from "@/lib/env";
import { requireViewerPage } from "@/server/dal";
import { getProposalDetail } from "@/server/proposal-queries";
import { PrintButton } from "../proposal-client";

export const metadata = { title: "Evidence pack" };

const day = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—");

/**
 * One page a proposer can print and carry into a meeting: what is being asked, how many verified
 * people want it, who they are, how they'd use it, and what the trial showed.
 */
export default async function EvidencePack({ params }: { params: Promise<{ number: string }> }) {
  const viewer = await requireViewerPage();
  const n = Number((await params).number);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const p = await getProposalDetail(viewer, n);
  if (!p) notFound();
  const ev = p.evidence;
  const total = p.supportCount;
  const first = ev.growth[0]?.day ?? null;
  const days = p.collectionDays;
  const generated = new Date(p.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  const officialPosts = p.posts.filter((t) => t.kind === "stage" || t.kind === "update");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/proposals/${p.number}`} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={15} /> Back to the proposal
        </Link>
        <PrintButton />
      </div>

      <article className="card space-y-8 p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-line pb-6">
          <div className="text-[13px] text-brand">Evidence of interest · Pulse, Plaksha University</div>
          <h1 className="font-display mt-3 text-[30px] leading-tight tracking-tight sm:text-[38px]">{p.title}</h1>
          <p className="mt-3 text-[17px] leading-relaxed">{p.ask}</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Meta k="Reference" v={`P-${p.number}`} />
            <Meta k="Area" v={AREA_LABEL[p.area] ?? p.area} />
            <Meta k="Proposed by" v={p.author.name} />
            <Meta k="Status" v={STAGE_META[p.stage].label} />
          </dl>
        </header>

        <section>
          <H>Summary</H>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Big n={total} l="verified supporters" />
            <Big n={ev.usage.often} l="would use it every week" />
            <Big n={ev.volunteers} l="volunteered to help run it" />
            <Big n={days} l={days === 1 ? "day of collection" : "days of collection"} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            Each supporter signed in with their own <b>@{env.allowedDomains[0]}</b> account and can be counted only once. Supporters were asked how often
            they would use it and whether they would help, so the figures above separate real demand from general goodwill.
          </p>
        </section>

        {ev.growth.length > 0 && (
          <section className="break-inside-avoid">
            <H>Support over time</H>
            <GrowthChart points={ev.growth} goal={p.goal} height={140} />
            <p className="mt-1 text-xs text-ink-muted">
              Cumulative supporters from {day(first)}. The dashed line is the goal the proposer set ({p.goal}).
            </p>
          </section>
        )}

        <section className="grid gap-8 break-inside-avoid sm:grid-cols-2">
          <div>
            <H>Who wants it</H>
            <Breakdown total={total} rows={ev.cohorts.map((c) => ({ label: c.cohort, n: c.n }))} />
          </div>
          <div>
            <H>Intended use</H>
            <Breakdown
              total={total}
              rows={[
                { label: USAGE_META.often.label, n: ev.usage.often, tone: "bg-mint" },
                { label: USAGE_META.sometimes.label, n: ev.usage.sometimes, tone: "bg-aqua" },
                { label: USAGE_META.backing.label, n: ev.usage.backing, tone: "bg-line-strong" },
              ]}
            />
          </div>
        </section>

        {p.body && (
          <section>
            <H>The case</H>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{p.body}</p>
          </section>
        )}

        {p.trialPlan && (
          <section className="break-inside-avoid">
            <H>{p.stage === "trial" || ev.trial.total > 0 ? "Trial run" : "Proposed trial"}</H>
            {p.trialStartsOn && (
              <p className="mb-2 text-sm font-medium">
                {day(p.trialStartsOn)} to {day(p.trialEndsOn)}
              </p>
            )}
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{p.trialPlan}</p>
          </section>
        )}

        {ev.trial.total > 0 && (
          <section className="break-inside-avoid">
            <H>What the trial showed</H>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Big n={ev.trial.total} l="check-ins" />
              <Big n={ev.trial.people} l="different people" />
              <Big n={ev.trial.days.length} l="days with use" />
              <Big n={Math.round((ev.trial.good / ev.trial.total) * 100)} l="% said it worked well" suffix="%" />
            </div>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="py-1.5 font-semibold">Day</th>
                  <th className="py-1.5 text-right font-semibold">Check-ins</th>
                  <th className="py-1.5 text-right font-semibold">{TRIAL_RATINGS[3].label}</th>
                </tr>
              </thead>
              <tbody>
                {ev.trial.days.map((d) => (
                  <tr key={d.day} className="border-b border-line">
                    <td className="py-1.5">{day(d.day)}</td>
                    <td className="py-1.5 text-right tabular">{d.n}</td>
                    <td className="py-1.5 text-right tabular">{d.good}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {ev.reasons.length > 0 && (
          <section>
            <H>In supporters&apos; words</H>
            <ul className="space-y-2.5">
              {ev.reasons.map((r, i) => (
                <li key={i} className="break-inside-avoid border-l-2 border-brand pl-3 text-sm">
                  <p className="leading-relaxed">“{r.reason}”</p>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {r.who}
                    {r.cohort && ` · ${r.cohort}`}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {officialPosts.length > 0 && (
          <section>
            <H>Record so far</H>
            <ul className="space-y-2 text-sm">
              {officialPosts.map((t) => (
                <li key={t.id} className="break-inside-avoid">
                  <span className="text-ink-muted">{new Date(t.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} · </span>
                  <b>{t.official ? (p.departmentName ?? "The office") : (t.author?.name ?? "—")}</b>
                  {t.kind === "stage" && t.toStage && <> moved it to {STAGE_META[t.toStage].label}</>}
                  {t.kind === "update" && <> posted an update</>}
                  {t.body && <span className="text-ink-2">: {t.body}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <H>
            Supporters who chose to be named <span className="font-sans text-sm font-normal text-ink-muted">({ev.named.length} of {total})</span>
          </H>
          <p className="columns-2 gap-6 text-[13px] leading-relaxed sm:columns-3">
            {ev.named.map((s, i) => (
              <span key={i} className="block break-inside-avoid">
                {s.name}
                {s.cohort && <span className="text-ink-muted"> · {s.cohort.replace("Class of ", "’").replace(/’20/, "’")}</span>}
                {s.volunteer && <span className="text-brand"> ●</span>}
              </span>
            ))}
          </p>
          {ev.volunteers > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              <span className="text-brand">●</span> volunteered to help run it
            </p>
          )}
        </section>

        <footer className="border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
          Generated {generated} IST from live data at {env.baseUrl.replace(/^https?:\/\//, "")}/proposals/{p.number}. Figures change as people add or withdraw
          support. Pulse is a student-built tool; it records interest and is not a university system of record.
        </footer>
      </article>
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display mb-3 text-xl tracking-tight">{children}</h2>;
}
function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-muted">{k}</dt>
      <dd className="mt-0.5 font-medium">{v}</dd>
    </div>
  );
}
function Big({ n, l, suffix }: { n: number; l: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="font-display text-[32px] leading-none tabular">
        {n}
        {suffix}
      </div>
      <div className="mt-1.5 text-xs leading-snug text-ink-muted">{l}</div>
    </div>
  );
}
