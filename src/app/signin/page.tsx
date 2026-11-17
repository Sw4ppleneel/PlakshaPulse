import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { env } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

/** Only same-origin relative paths are allowed as a post-login destination (no open redirects). */
function safeNext(v: string | string[] | undefined) {
  const s = (Array.isArray(v) ? v[0] : v)?.slice(0, 200);
  // Browsers drop tabs and newlines in URLs ("/\t/evil.com" becomes "//evil.com"), so parse it the
  // way a browser would and keep it only if it stays on this site.
  if (!s || !s.startsWith("/") || /[\u0000-\u001f\\]/.test(s)) return "/board";
  try {
    const u = new URL(s, "http://pulse.local");
    return u.origin === "http://pulse.local" ? u.pathname + u.search : "/board";
  } catch {
    return "/board";
  }
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getViewer()) redirect(next);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo size={34} />
      </Link>
      <div className="card w-full max-w-[400px] p-6 !shadow-[var(--shadow-pop)] sm:p-8 animate-rise">
        <h1 className="font-display text-[28px] leading-tight tracking-tight">Sign in to Pulse</h1>
        <p className="mt-1.5 text-sm text-ink-muted">Use your Plaksha account. Nobody outside @{env.allowedDomains[0]} can get in.</p>
        <SignInForm next={next} microsoft={!!env.microsoft} domain={env.allowedDomains[0]!} error={typeof sp.error === "string" ? sp.error : undefined} />
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-ink-muted">
        By signing in you agree to keep reports about campus issues — not people. Abusive posts can be removed and accounts suspended.
      </p>
    </div>
  );
}
