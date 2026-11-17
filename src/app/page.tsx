import { ArrowRight, Check, FlaskConical, Lightbulb, Lock, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FadeIn, Stagger, StaggerItem } from "@/components/motion";
import { Logo, buttonClass } from "@/components/ui";
import { getViewer } from "@/server/dal";

export default async function Landing() {
  if (await getViewer()) redirect("/board");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1080px] flex-col px-5 sm:px-8">
      <header className="flex h-20 items-center justify-between">
        <Logo />
        <Link href="/signin" className={buttonClass("secondary", "md", "bg-surface shadow-card")}>
          Sign in
        </Link>
      </header>

      <main className="flex-1">
        <section className="grid items-center gap-10 pb-12 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-20 lg:pt-14">
          <FadeIn>
            <h1 className="text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[64px]">
              Raise it once.
              <br />
              <span className="text-ink-muted">Watch it move.</span>
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-muted">
              One open board for what students want changed at Plaksha. See who owns it, where it stands, and how many people are behind it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/signin" className={buttonClass("primary", "lg")}>
                Sign in with Plaksha email <ArrowRight size={18} aria-hidden />
              </Link>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
                <Lock size={13} aria-hidden /> Only @plaksha.edu.in
              </span>
            </div>
          </FadeIn>
          <FadeIn delay={0.12} y={18}>
            <Ticket />
          </FadeIn>
        </section>

        <Stagger className="grid gap-4 pb-16 sm:grid-cols-3">
          {[
            [Wrench, "Issues", "Something is broken. Report it once, others add a me-too, and the office that owns it fixes it in public."],
            [Lightbulb, "Proposals", "Something should exist. Collect support, run a trial, get a decision. The support you collect is the interest poll."],
            [Check, "One person, one count", "Everyone signs in with their Plaksha email, so every number on the board is a real person on campus."],
          ].map(([I, t, d]) => {
            const Icon = I as typeof Wrench;
            return (
              <StaggerItem key={t as string} className="card p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-surface-2">
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
                <h2 className="mt-5 text-lg font-semibold tracking-tight">{t as string}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{d as string}</p>
              </StaggerItem>
            );
          })}
        </Stagger>
      </main>

      <footer className="pb-8 text-center text-[13px] text-ink-muted">A student-built tool for the Plaksha community, not an official university system. Built by Swapneel.</footer>
    </div>
  );
}

/** A proposal drawn as a ticket: what is asked, how many want it, and how far along it is. */
function Ticket() {
  const steps = ["Interest", "Office", "Trial", "Decision"];
  return (
    <div className="mx-auto w-full max-w-[420px] text-ondark [filter:drop-shadow(0_18px_30px_rgb(13_18_16/0.22))]" aria-hidden>
      <div className="on-dark rounded-t-3xl p-6 !shadow-none">
        <div className="flex items-center justify-between">
          <span className="label">Proposal · Academics</span>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 text-xs font-medium text-brand">
            <FlaskConical size={12} /> Trial run
          </span>
        </div>
        <div className="mt-5 text-[22px] font-semibold leading-snug tracking-tight">Keep the makerspace open till midnight</div>
        <div className="mt-6 flex items-end justify-between">
          <div>
            <span className="text-[44px] font-semibold leading-none tracking-tight tabular">84</span>
            <span className="ml-2 text-sm text-ink-muted">supporters</span>
          </div>
          <span className="text-[13px] font-medium text-brand">53 would use it weekly</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="grow-x h-full w-[84%] rounded-full bg-mint" />
        </div>
      </div>
      <div className="ticket-notch -my-px bg-dark" />
      <div className="on-dark grid grid-cols-4 gap-2 rounded-b-3xl px-6 pb-6 pt-2 !shadow-none">
        {steps.map((s, i) => (
          <div key={s}>
            <div className={i < 2 ? "h-1.5 rounded-full bg-mint" : i === 2 ? "h-1.5 animate-pulse rounded-full bg-mint/50" : "h-1.5 rounded-full bg-surface-3"} />
            <div className={i <= 2 ? "mt-2 text-xs font-medium" : "mt-2 text-xs text-ink-muted"}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
