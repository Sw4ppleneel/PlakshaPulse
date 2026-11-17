"use client";

import { Bell, Building2, CheckCheck, CircleCheckBig, LayoutGrid, Lightbulb, LogOut, Monitor, Moon, Plus, ShieldCheck, Sun, User, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { cn, timeAgo } from "@/lib/format";
import { markAllRead } from "@/server/actions/issues";
import { fetchNotifications, setTheme } from "@/server/actions/prefs";
import { SPRING } from "./motion";
import { Avatar, Logo } from "./ui";

type ViewerLite = { name: string; email: string; image: string | null; role: "member" | "staff" | "mod" | "admin"; departmentName: string | null };
type NavItem = { href: string; label: string; icon: LucideIcon; match: string[] };

const ISSUES: NavItem = { href: "/board", label: "Issues", icon: LayoutGrid, match: ["/board", "/issues"] };
const PROPOSALS: NavItem = { href: "/proposals", label: "Proposals", icon: Lightbulb, match: ["/proposals"] };
const FIXED: NavItem = { href: "/fixed", label: "Fixed", icon: CircleCheckBig, match: ["/fixed"] };
const DEPARTMENTS: NavItem = { href: "/departments", label: "Departments", icon: Building2, match: ["/departments"] };
const ME: NavItem = { href: "/me", label: "Me", icon: User, match: ["/me"] };
const manage = (role: ViewerLite["role"]): NavItem => ({ href: "/admin", label: role === "admin" ? "Admin" : role === "mod" ? "Moderation" : "My queue", icon: ShieldCheck, match: ["/admin"] });

const isActive = (path: string, item: NavItem) => item.match.some((m) => path === m || path.startsWith(m + "/"));

/** What the one primary action is depends on which half of Pulse you are in. */
function useCreate() {
  const path = usePathname();
  const proposing = path.startsWith("/proposals");
  return { href: proposing ? "/proposals/new" : "/issues/new", label: proposing ? "Propose something" : "Report an issue" };
}

/* ───────────────────────── Desktop: sidebar ───────────────────────── */

export function Sidebar({ viewer, unread, waiting }: { viewer: ViewerLite; unread: number; waiting: number }) {
  const path = usePathname();
  const create = useCreate();
  const items = [ISSUES, PROPOSALS, FIXED, DEPARTMENTS, ...(viewer.role === "member" ? [] : [manage(viewer.role)])];
  return (
    <aside
      aria-label="Sidebar"
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface px-5 pb-5 pt-7 lg:flex print:!hidden"
    >
      <Link href="/board" className="rounded-2xl px-2 py-1" aria-label="Pulse home">
        <Logo />
      </Link>

      <motion.div className="mt-8" whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={SPRING}>
        <Link href={create.href} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-mint px-5 text-[15px] font-semibold text-brand-ink shadow-glow">
          <Plus size={20} strokeWidth={2.2} aria-hidden />
          {create.label}
        </Link>
      </motion.div>

      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(path, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex h-12 items-center gap-3 rounded-full px-4 text-[15px] font-medium transition-colors duration-200", active ? "text-ink" : "text-ink-muted hover:text-ink")}
            >
              {active && <motion.span layoutId="side-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-surface-2" />}
              <Icon size={20} strokeWidth={active ? 2.1 : 1.75} className="relative" aria-hidden />
              <span className="relative">{item.label}</span>
              {item.href === "/admin" && waiting > 0 && (
                <span className="relative ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-[#3a2a00] tabular" aria-label={`${waiting} waiting for approval`}>
                  {waiting > 99 ? "99+" : waiting}
                </span>
              )}
            </Link>
          );
        })}
        <Notifications unread={unread} variant="row" />
      </nav>

      <div className="flex-1" />
      <UserMenu viewer={viewer} variant="card" />
    </aside>
  );
}

/* ───────────────────────── Phone: top row + floating nav ───────────────────────── */

export function MobileTop({ viewer, unread }: { viewer: ViewerLite; unread: number }) {
  return (
    <div className="pt-safe flex h-[4.25rem] items-end justify-between px-5 pb-1 lg:hidden print:!hidden">
      <Link href="/board" aria-label="Pulse home" className="rounded-2xl">
        <Logo size={36} />
      </Link>
      <div className="flex items-center gap-2">
        <Notifications unread={unread} variant="icon" />
        <UserMenu viewer={viewer} variant="avatar" />
      </div>
    </div>
  );
}

export function BottomNav({ role, waiting }: { role: ViewerLite["role"]; waiting: number }) {
  const path = usePathname();
  const create = useCreate();
  const last = role === "member" ? ME : { ...manage(role), label: role === "admin" ? "Admin" : role === "mod" ? "Review" : "Queue" };
  const tab = (item: NavItem) => {
    const active = isActive(path, item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-[52px] min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors duration-200",
          active ? "text-ink" : "text-ink-muted",
        )}
      >
        {active && <motion.span layoutId="nav-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-surface-2" />}
        <motion.span className="relative" animate={{ y: active ? -1 : 0, scale: active ? 1.06 : 1 }} transition={SPRING}>
          <Icon size={21} strokeWidth={active ? 2.1 : 1.75} aria-hidden />
          {item.href === "/admin" && waiting > 0 && <span className="absolute -right-1.5 -top-1 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
        </motion.span>
        <span className="relative truncate">{item.label}</span>
      </Link>
    );
  };
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 z-40 mx-auto w-full max-w-[440px] px-4 lg:hidden print:!hidden" style={{ bottom: "var(--nav-gap)" }}>
      <div className="frost pointer-events-auto flex h-[68px] items-center gap-1 rounded-full px-2 shadow-nav">
        {tab(ISSUES)}
        {tab(PROPOSALS)}
        <div className="flex w-[68px] shrink-0 justify-center">
          <motion.div whileTap={{ scale: 0.9, rotate: 90 }} transition={SPRING} className="-mt-7">
            <Link href={create.href} aria-label={create.label} className="inline-flex size-[60px] items-center justify-center rounded-full bg-mint text-brand-ink shadow-glow ring-[5px] ring-bg">
              <Plus size={26} strokeWidth={2.2} aria-hidden />
            </Link>
          </motion.div>
        </div>
        {tab(FIXED)}
        {tab(last)}
      </div>
    </nav>
  );
}

/* ───────────────────────── Popovers ───────────────────────── */

function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
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

/** Scales in from the corner nearest its trigger, and leaves faster than it arrives. */
function Pop({ open, className, origin, children }: { open: boolean; className: string; origin: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn("card absolute z-50 overflow-hidden !shadow-[var(--shadow-pop)]", className)}
          style={{ transformOrigin: origin }}
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: SPRING }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Notifications({ unread, variant }: { unread: number; variant: "row" | "icon" }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchNotifications>> | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) start(async () => setItems(await fetchNotifications()));
  };
  const count = unread > 9 ? "9+" : unread;

  return (
    <div className="relative" ref={ref}>
      {variant === "row" ? (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={`Updates${unread ? `, ${unread} unread` : ""}`}
          className={cn("flex h-12 w-full items-center gap-3 rounded-full px-4 text-[15px] font-medium transition-colors duration-200", open ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink")}
        >
          <Bell size={20} strokeWidth={1.75} aria-hidden />
          Updates
          {unread > 0 && <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-mint px-1.5 text-xs font-semibold text-brand-ink tabular">{count}</span>}
        </button>
      ) : (
        <button onClick={toggle} aria-expanded={open} aria-label={`Updates${unread ? `, ${unread} unread` : ""}`} className="relative inline-flex size-11 items-center justify-center rounded-full bg-surface shadow-card active:scale-95">
          <Bell size={20} strokeWidth={1.75} aria-hidden />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-mint ring-2 ring-surface" />}
        </button>
      )}
      <Pop
        open={open}
        origin={variant === "row" ? "top left" : "top right"}
        className={variant === "row" ? "left-full top-0 ml-3 w-[380px]" : "right-0 top-[3.25rem] w-[min(calc(100vw-2.5rem),380px)]"}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="font-semibold">Updates</div>
          <button
            className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
            onClick={() =>
              start(async () => {
                await markAllRead();
                setItems((it) => it?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null);
                router.refresh();
              })
            }
          >
            <CheckCheck size={14} aria-hidden /> Mark all read
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto px-2 pb-2">
          {!items && pending && <div className="p-6 text-center text-sm text-ink-muted">Loading…</div>}
          {items && items.length === 0 && <div className="px-6 py-10 text-center text-sm text-ink-muted">Nothing yet. Updates on things you report or back show up here.</div>}
          {items?.map((n) => (
            <Link
              key={n.id}
              href={n.proposalNumber ? `/proposals/${n.proposalNumber}` : n.issueNumber ? `/issues/${n.issueNumber}` : "/me"}
              onClick={() => setOpen(false)}
              className="flex gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors hover:bg-surface-2"
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-mint")} />
              <span className="min-w-0">
                <span className={cn("block leading-snug", n.readAt ? "text-ink-muted" : "text-ink")}>{n.message}</span>
                <span className="mt-0.5 block text-xs text-ink-muted" suppressHydrationWarning>
                  {timeAgo(n.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Pop>
    </div>
  );
}

function UserMenu({ viewer, variant }: { viewer: ViewerLite; variant: "card" | "avatar" }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const router = useRouter();
  const roleLabel = viewer.role === "admin" ? "Admin" : viewer.role === "mod" ? "Moderator" : viewer.role === "staff" ? (viewer.departmentName ?? "Staff") : null;

  const theme = async (t: "light" | "dark" | "system") => {
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    await setTheme(t);
  };
  const item = "flex h-11 items-center gap-3 rounded-2xl px-3 text-sm transition-colors hover:bg-surface-2";

  return (
    <div className="relative" ref={ref}>
      {variant === "card" ? (
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu" className="flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left transition-colors hover:bg-surface-3">
          <Avatar name={viewer.name} image={viewer.image} size={40} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{viewer.name}</span>
            <span className="block truncate text-[13px] text-ink-muted">{roleLabel ?? viewer.email}</span>
          </span>
        </button>
      ) : (
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu" className="inline-flex size-11 items-center justify-center rounded-full active:scale-95">
          <Avatar name={viewer.name} image={viewer.image} size={40} />
        </button>
      )}
      <Pop open={open} origin={variant === "card" ? "bottom left" : "top right"} className={variant === "card" ? "bottom-full left-0 mb-2 w-full" : "right-0 top-[3.25rem] w-64"}>
        <div className="p-2">
          <div className="px-3 pb-2 pt-2">
            <div className="truncate text-sm font-semibold">{viewer.name}</div>
            <div className="truncate text-[13px] text-ink-muted">{viewer.email}</div>
          </div>
          <Link href="/me" onClick={() => setOpen(false)} className={item}>
            <User size={17} strokeWidth={1.75} aria-hidden /> My activity
          </Link>
          <Link href="/departments" onClick={() => setOpen(false)} className={cn(item, "lg:hidden")}>
            <Building2 size={17} strokeWidth={1.75} aria-hidden /> Departments
          </Link>
          <div className="my-1 flex items-center gap-1 rounded-full bg-surface-2 p-1" role="group" aria-label="Theme">
            {(
              [
                ["light", Sun],
                ["dark", Moon],
                ["system", Monitor],
              ] as const
            ).map(([t, I]) => (
              <button key={t} onClick={() => theme(t)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium capitalize text-ink-muted transition-colors hover:bg-surface hover:text-ink">
                <I size={14} aria-hidden /> {t}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
            className={cn(item, "w-full text-danger hover:bg-danger-soft")}
          >
            <LogOut size={17} strokeWidth={1.75} aria-hidden /> Sign out
          </button>
        </div>
      </Pop>
    </div>
  );
}

/** Keeps server-rendered data fresh without websockets: refresh while the tab is visible. */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
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
