import { ArrowRight, BellRing, CheckCircle2, EyeOff, GitMerge, Hand, Lock, MessageSquareOff, QrCode, ShieldCheck, Timer, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo, buttonClass } from "@/components/ui";
import { getViewer } from "@/server/dal";

export default async function Landing() {
  if (await getViewer()) redirect("/board");

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <Link href="/signin" className={buttonClass("secondary", "sm")}>
          Sign in
        </Link>
      </header>

      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
            <Lock size={12} className="text-brand" /> Only for @plaksha.edu.in accounts
          </div>
          <h1 className="font-display mt-5 text-[44px] leading-[1.02] tracking-tight sm:text-[64px]">
            Every campus issue,
            <br />
            <span className="italic text-brand">in the open.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2">
            Report it once. Watch it grow as others say <b>me too</b>. See exactly which office owns it, how long it&apos;s been waiting — and confirm
            when it&apos;s actually fixed.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signin" className={buttonClass("primary", "lg")}>
              Sign in with your Plaksha account <ArrowRight size={18} />
            </Link>
            <a href="#how" className={buttonClass("ghost", "lg")}>
              How it works
            </a>
          </div>
          <p className="mt-4 text-xs text-ink-muted">Students, faculty and staff all see the same board. Nothing is visible outside Plaksha.</p>
        </div>
        <HeroBubbles />
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-bg p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <QrCode size={18} /> Today: scan a QR, fill a form
            </div>
            <ul className="mt-5 space-y-4 text-[15px]">
              {[
                [EyeOff, "Your ticket disappears into an inbox. No one else can see it."],
                [Users, "Forty people file the same Wi-Fi complaint — none of them know."],
                [MessageSquareOff, "Updates live in WhatsApp threads and get buried by morning."],
                [Timer, "No timeline, no owner, no way to say “this still isn't fixed.”"],
              ].map(([I, t], i) => {
                const Icon = I as typeof EyeOff;
                return (
                  <li key={i} className="flex gap-3 text-ink-2">
                    <Icon size={18} className="mt-0.5 shrink-0 text-danger" /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-3xl border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-brand-soft p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand">
              <Logo size={18} withWord={false} /> With Pulse
            </div>
            <ul className="mt-5 space-y-4 text-[15px]">
              {[
                [Users, "One public board for the whole campus — admin and faculty see what you see."],
                [GitMerge, "Duplicates merge. Every me-too makes the bubble bigger and harder to ignore."],
                [Timer, "Each issue has an owner, a target time and a public, permanent timeline."],
                [CheckCircle2, "“Fixed” only sticks when the people who reported it agree."],
              ].map(([I, t], i) => {
                const Icon = I as typeof EyeOff;
                return (
                  <li key={i} className="flex gap-3 text-ink">
                    <Icon size={18} className="mt-0.5 shrink-0 text-brand" /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl tracking-tight sm:text-4xl">From “ugh” to fixed, in public.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Hand, "Report or me-too", "Start typing and Pulse shows matching issues. If it's already there, one tap adds you."],
            [Users, "It grows", "Bubbles scale with the number of people affected and glow with recent activity."],
            [ShieldCheck, "Someone owns it", "It routes to the right office with a target time. Every update lands on the timeline."],
            [BellRing, "You confirm the fix", "When it's marked fixed, you get asked. Two “still broken” replies reopen it."],
          ].map(([I, t, d], i) => {
            const Icon = I as typeof Hand;
            return (
              <div key={i} className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Icon size={19} />
                  </span>
                  <span className="font-display text-2xl text-line-strong">0{i + 1}</span>
                </div>
                <div className="mt-4 font-semibold">{t as string}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{d as string}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-10 rounded-3xl bg-ink p-8 text-bg sm:flex sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-2xl">Verified Plaksha identity. Optional anonymity.</div>
            <p className="mt-2 max-w-xl text-sm opacity-75">
              Sign-in is locked to the Plaksha Microsoft 365 tenant, so no outsiders and no throwaway accounts. You can post anonymously — other students won&apos;t
              see your name, though campus admins can, to keep it accountable.
            </p>
          </div>
          <Link href="/signin" className={buttonClass("accent", "lg", "mt-6 shrink-0 sm:mt-0")}>
            Open the board <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <footer className="border-t border-line py-8 text-center text-xs text-ink-muted">
        Pulse is a student-built tool for the Plaksha community. Not an official university system of record.
      </footer>
    </div>
  );
}

/** Decorative only — real issue data never leaves the authenticated app. */
function HeroBubbles() {
  // Layout precomputed with the same d3-force collide the live board uses, so nothing overlaps.
  const raw: [number, number, number, number, string, string, string][] = [
    [64, 54.6, 46.4, 18.8, "#00A0B4", "Wi-Fi drops at night", "progress"],
    [41, 23.4, 64.8, 15, "#2D7DD2", "No hot water", "ack"],
    [37, 43.7, 12.6, 14.3, "#E4572E", "Dinner runs out", "open"],
    [44, 75.9, 76.4, 15.6, "#D89614", "Need heaters", "open"],
    [33, 22.3, 33.9, 13.5, "#1A3A5C", "Dark path", "progress"],
    [23, 87, 32, 11.3, "#3E9B4F", "Bins overflow", "fixed"],
    [18, 48, 76.9, 10, "#7B61FF", "", "open"],
    [11, 19.4, 10.3, 7.8, "#9A6B4F", "", "open"],
    [9, 82.3, 52.2, 7.1, "#0F9D8A", "", "open"],
    [7, 5.9, 48.8, 6.2, "#D2323C", "", "open"],
    [14, 68.2, 19.7, 8.8, "#007878", "", "ack"],
    [12, 57.6, 95, 8.1, "#6B7280", "", "open"],
  ];
  const b = raw.map(([n, x, y, r, c, t, ring]) => ({ n, x: 50 + (x - 49) * 0.9, y: 50 + (y - 50.7) * 0.88, r: r * 0.9, c, t, ring }));
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px] animate-rise" aria-hidden>
      <div className="dot-grid absolute inset-0 rounded-[40px] border border-line bg-surface" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        {b.map((x, i) => (
          <g key={i} style={{ transformOrigin: `${x.x}px ${x.y}px`, animation: `float ${4 + (i % 3)}s ease-in-out ${i * 0.4}s infinite` }}>
            <circle cx={x.x} cy={x.y} r={x.r} fill={x.c} fillOpacity={0.18} stroke={x.ring === "fixed" ? "var(--ok)" : x.c} strokeWidth={0.45} strokeDasharray={x.ring === "open" ? "1.2 0.9" : undefined} />
            {x.ring === "progress" && <circle cx={x.x} cy={x.y} r={x.r + 1.2} fill="none" stroke={x.c} strokeOpacity={0.7} strokeWidth={0.6} strokeDasharray={`${x.r * 4.2} 999`} strokeLinecap="round" transform={`rotate(-90 ${x.x} ${x.y})`} />}
            {x.r >= 6.5 && (
              <text x={x.x} y={x.t ? x.y - 0.6 : x.y + x.r / 7} textAnchor="middle" fontSize={x.t ? x.r / 2.5 : x.r / 1.9} fontWeight={600} fill="var(--ink)" style={{ fontFamily: "var(--font-fraunces)" }}>
                {x.n}
              </text>
            )}
            {x.t && (
              <text x={x.x} y={x.y + x.r / 2.6} textAnchor="middle" fontSize={Math.max(2.4, x.r / 6.2)} fontWeight={500} fill="var(--ink-2)">
                {x.t}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="card absolute -bottom-4 left-4 flex items-center gap-3 px-4 py-3 !shadow-[var(--shadow-pop)] sm:left-8">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand text-brand-ink">
          <Hand size={17} />
        </span>
        <div className="text-sm">
          <div className="font-semibold">You&apos;re the 14th person</div>
          <div className="text-xs text-ink-muted">Merged in — you&apos;ll hear when it moves.</div>
        </div>
      </div>
    </div>
  );
}
