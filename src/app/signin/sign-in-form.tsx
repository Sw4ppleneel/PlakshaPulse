"use client";

import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next, microsoft, domain, error }: { next: string; microsoft: boolean; domain: string; error?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error ? "That account isn't allowed. Use your Plaksha account." : null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const fullEmail = email.includes("@") ? email.trim().toLowerCase() : `${email.trim().toLowerCase()}@${domain}`;
  const domainOk = fullEmail.endsWith(`@${domain}`);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!domainOk) return setMsg(`Use your @${domain} address.`);
    setBusy(true);
    setMsg(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: fullEmail, type: "sign-in" });
    setBusy(false);
    if (error) return setMsg(error.message ?? "Couldn't send a code. Try again in a minute.");
    setStep("code");
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setMsg(null);
    const { error } = await authClient.signIn.emailOtp({ email: fullEmail, otp: value });
    if (error) {
      setBusy(false);
      setCode("");
      return setMsg(error.message ?? "That code didn't work.");
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="mt-6 space-y-4">
      {microsoft && step === "email" && (
        <>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await authClient.signIn.social({ provider: "microsoft", callbackURL: next, errorCallbackURL: "/signin?error=denied" });
            }}
          >
            <MicrosoftMark /> Continue with Microsoft
          </Button>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="h-px flex-1 bg-line" /> or get a code by email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {step === "email" ? (
        <form onSubmit={send} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            Plaksha email
          </label>
          <div className="flex h-12 items-center rounded-xl bg-surface-2 transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand">
            <Mail size={17} className="ml-3.5 shrink-0 text-ink-muted" />
            <input
              id="email"
              autoFocus
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="firstname.x.ug25"
              aria-describedby="email-hint"
              className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[16px] outline-none placeholder:text-ink-muted"
            />
            {!email.includes("@") && <span className="pr-3.5 text-sm text-ink-muted">@{domain}</span>}
          </div>
          <p id="email-hint" className="text-[13px] text-ink-muted">
            Your full Plaksha address, including the batch part (like <span className="font-medium text-ink-2">.ug25</span>) if you have one.
          </p>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : null} Email me a sign-in code
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <button onClick={() => setStep("email")} className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
            <ArrowLeft size={13} /> Change email
          </button>
          <p className="text-sm text-ink-2">
            We sent a 6-digit code to <b className="break-all">{fullEmail}</b>. Check your Outlook inbox.
          </p>
          <p className="text-[13px] text-ink-muted">Nothing after a minute? Check junk, and that the address is exactly right — a missing batch part means it went nowhere.</p>
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) verify(v);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            placeholder="••••••"
            className="font-display h-14 w-full rounded-xl bg-surface-2 text-center text-[28px] tracking-[0.5em] outline-none focus:bg-surface focus:ring-2 focus:ring-brand tabular"
          />
          <Button size="lg" className="w-full" disabled={busy || code.length !== 6} onClick={() => verify()}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : null} Sign in
          </Button>
          <button onClick={() => send()} disabled={busy} className="w-full text-center text-xs font-medium text-brand hover:underline">
            Resend code
          </button>
        </div>
      )}
      {msg && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {msg}
        </p>
      )}
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
