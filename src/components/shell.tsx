"use client";

import { Bell, Building2, CheckCheck, CircleCheckBig, LayoutGrid, LogOut, Monitor, Moon, Plus, ShieldCheck, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { cn, timeAgo } from "@/lib/format";
import { markAllRead } from "@/server/actions/issues";
import { fetchNotifications, setTheme } from "@/server/actions/prefs";
import { Avatar, buttonClass } from "./ui";

type ViewerLite = { name: string; email: string; image: string | null; role: "member" | "staff" | "admin"; departmentName: string | null };

const NAV = [
  { href: "/board", label: "Board", icon: LayoutGrid },
  { href: "/fixed", label: "Fixed", icon: CircleCheckBig },
  { href: "/departments", label: "Departments", icon: Building2 },
];

export function TopNav({ viewer, unread }: { viewer: ViewerLite; unread: number }) {
  const path = usePathname();
  const items = viewer.role === "member" ? NAV : [...NAV, { href: "/admin", label: viewer.role === "admin" ? "Admin" : "My queue", icon: ShieldCheck }];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/board" className="mr-2 shrink-0 rounded-lg" aria-label="Pulse home">
          <LogoMark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {items.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-muted hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/issues/new" className={buttonClass("primary", "md", "hidden sm:inline-flex")}>
            <Plus size={17} strokeWidth={2.4} /> Report an issue
          </Link>
          <NotificationBell unread={unread} />
          <UserMenu viewer={viewer} />
        </div>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={30} height={30} viewBox="0 0 32 32" aria-hidden>
        <circle cx="12" cy="18" r="9.5" fill="var(--brand)" />
        <circle cx="22.5" cy="11" r="6" fill="var(--aqua)" opacity=".9" />
        <circle cx="24.5" cy="23.5" r="3.6" fill="var(--accent)" />
        <path d="M6.5 18h3l1.6-3.6 2.4 7.2 1.6-3.6h2.4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="leading-none">
        <span className="font-display block text-[19px] font-semibold tracking-tight">Pulse</span>
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ink-muted">Plaksha</span>
      </span>
    </span>
  );
}

function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchNotifications>> | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) start(async () => setItems(await fetchNotifications()));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative inline-flex size-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-[18px] text-white ring-2 ring-bg tabular">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden !shadow-[var(--shadow-pop)] animate-rise">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="font-semibold">Updates</div>
            <button
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              onClick={() =>
                start(async () => {
                  await markAllRead();
                  setItems((it) => it?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
                  router.refresh();
                })
              }
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {!items && pending && <div className="p-6 text-center text-sm text-ink-muted">Loading…</div>}
            {items && items.length === 0 && (
              <div className="p-8 text-center text-sm text-ink-muted">Nothing yet. Updates on issues you report or me-too show up here.</div>
            )}
            {items?.map((n) => (
              <Link
                key={n.id}
                href={n.issueNumber ? `/issues/${n.issueNumber}` : "/me"}
                onClick={() => setOpen(false)}
                className={cn("flex gap-3 border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-surface-2", !n.readAt && "bg-brand-soft/60")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
                <span className="min-w-0">
                  <span className="block leading-snug text-ink">{n.message}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted" suppressHydrationWarning>
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <Link href="/me" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-xs font-semibold text-ink-muted hover:text-ink">
            See everything you follow
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu({ viewer }: { viewer: ViewerLite }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside<HTMLDivElement>(open, () => setOpen(false));
  const router = useRouter();
  const roleLabel = viewer.role === "admin" ? "Admin" : viewer.role === "staff" ? (viewer.departmentName ?? "Staff") : "Member";

  const theme = async (t: "light" | "dark" | "system") => {
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    await setTheme(t);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="rounded-full ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-line-strong" aria-label="Account menu" aria-expanded={open}>
        <Avatar name={viewer.name} image={viewer.image} size={34} />
      </button>
      {open && (
        <div className="card absolute right-0 top-12 z-50 w-64 overflow-hidden !shadow-[var(--shadow-pop)] animate-rise">
          <div className="border-b border-line px-4 py-3">
            <div className="truncate font-semibold">{viewer.name}</div>
            <div className="truncate text-xs text-ink-muted">{viewer.email}</div>
            <span className="mt-2 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">{roleLabel}</span>
          </div>
          <Link href="/me" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-surface-2">
            <User size={16} /> My reports & follows
          </Link>
          <div className="flex items-center gap-1 px-3 py-2">
            {(
              [
                ["light", Sun],
                ["dark", Moon],
                ["system", Monitor],
              ] as const
            ).map(([t, I]) => (
              <button key={t} onClick={() => theme(t)} className="flex flex-1 items-center justify-center gap-1 rounded-lg py-1.5 text-xs capitalize text-ink-muted hover:bg-surface-2 hover:text-ink">
                <I size={14} /> {t}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
            className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-sm text-danger hover:bg-danger-soft"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function MobileNav({ role }: { role: ViewerLite["role"] }) {
  const path = usePathname();
  const items = [
    NAV[0]!,
    NAV[1]!,
    { href: "/issues/new", label: "Report", icon: Plus, primary: true },
    NAV[2]!,
    role === "member" ? { href: "/me", label: "Me", icon: User } : { href: "/admin", label: role === "admin" ? "Admin" : "Queue", icon: ShieldCheck },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Main"
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((n) => {
          const active = path === n.href || path.startsWith(n.href + "/");
          const I = n.icon;
          if ("primary" in n)
            return (
              <Link key={n.href} href={n.href} className="flex flex-col items-center justify-center py-1.5" aria-label="Report an issue">
                <span className="-mt-5 inline-flex size-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--brand)_80%,transparent)] ring-4 ring-bg">
                  <Plus size={22} strokeWidth={2.6} />
                </span>
              </Link>
            );
          return (
            <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", active ? "text-brand" : "text-ink-muted")}>
              <I size={20} strokeWidth={active ? 2.3 : 1.8} />
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Keeps server-rendered data fresh without websockets: refresh while the tab is visible. */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    const onVis = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, seconds]);
  return null;
}
