import {
  BedDouble,
  Bus,
  CircleHelp,
  Droplets,
  Dumbbell,
  GraduationCap,
  HeartPulse,
  ShieldAlert,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_META, type Status } from "@/lib/constants";
import { cn, initials, slaLabel } from "@/lib/format";

export const ICONS: Record<string, LucideIcon> = {
  Wifi,
  Zap,
  Droplets,
  Sparkles,
  UtensilsCrossed,
  BedDouble,
  GraduationCap,
  HeartPulse,
  ShieldAlert,
  Bus,
  Dumbbell,
  CircleHelp,
};

export function CategoryIcon({ icon, color, size = 16, boxed = false }: { icon: string; color: string; size?: number; boxed?: boolean }) {
  const I = ICONS[icon] ?? CircleHelp;
  if (!boxed) return <I size={size} style={{ color }} aria-hidden />;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, width: size * 2.1, height: size * 2.1 }}
    >
      <I size={size} style={{ color }} aria-hidden />
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  open: "bg-surface-2 text-ink-2",
  acknowledged: "bg-[color-mix(in_srgb,var(--aqua)_14%,transparent)] text-aqua",
  in_progress: "bg-brand-soft text-brand",
  resolved: "bg-accent-soft text-accent-ink",
  closed: "bg-ok-soft text-ok",
  wont_fix: "bg-surface-2 text-ink-muted",
  duplicate: "bg-surface-2 text-ink-muted",
};

const STATUS_DOT: Record<Status, string> = {
  open: "border border-dashed border-ink-muted",
  acknowledged: "bg-aqua",
  in_progress: "bg-mint animate-pulse",
  resolved: "bg-accent",
  closed: "bg-ok",
  wont_fix: "bg-ink-muted",
  duplicate: "bg-ink-muted",
};

export function StatusPill({ status, short = false, className }: { status: Status; short?: boolean; className?: string }) {
  return (
    <span
      title={STATUS_META[status].hint}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        STATUS_STYLE[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {short ? STATUS_META[status].short : STATUS_META[status].label}
    </span>
  );
}

export function SlaChip({ dueAt, status }: { dueAt: string; status: Status }) {
  if (!["open", "acknowledged", "in_progress"].includes(status)) return null;
  const s = slaLabel(dueAt);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium tabular",
        s.tone === "danger" && "bg-danger-soft text-danger",
        s.tone === "warn" && "bg-warn-soft text-warn",
        s.tone === "muted" && "bg-surface-2 text-ink-muted",
      )}
      suppressHydrationWarning
    >
      {s.text}
    </span>
  );
}

export function Avatar({ name, image, size = 28, className }: { name: string; image?: string | null; size?: number; className?: string }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (image && image.startsWith("http"))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} className={cn("rounded-full object-cover", className)} />;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 46% 86%)`, color: `hsl(${hue} 42% 24%)` }}
    >
      {initials(name)}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "accent"; size?: "sm" | "md" | "lg" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function buttonClass(variant: "primary" | "secondary" | "ghost" | "danger" | "accent" = "primary", size: "sm" | "md" | "lg" = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,filter,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
    size === "sm" && "h-9 px-3.5 text-[13px]",
    size === "md" && "h-11 px-5 text-sm",
    size === "lg" && "h-[52px] px-6 text-[15px]",
    // One primary action per screen: the mint fill with the glow under it.
    variant === "primary" && "bg-mint text-brand-ink shadow-glow hover:brightness-[1.04]",
    variant === "accent" && "bg-ink text-bg hover:opacity-90",
    variant === "secondary" && "bg-surface-2 text-ink hover:bg-surface-3",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2",
    variant === "danger" && "bg-danger-soft text-danger hover:brightness-95",
    className,
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "ok" | "warn" | "danger" }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div
        className={cn(
          "mt-1 text-[28px] font-semibold leading-none tracking-tight tabular",
          tone === "brand" && "text-brand",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-2 inline-flex size-14 items-center justify-center rounded-full bg-surface-2 text-ink-muted">{icon}</div>}
      <div className="text-lg font-semibold tracking-tight">{title}</div>
      {children && <div className="max-w-sm text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

/** The mark: a dark rounded tile with the pulse line in mint. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center bg-dark" style={{ width: size, height: size, borderRadius: size * 0.32 }} aria-hidden>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12.5h4l2.2-6 4.2 12 2.6-6h6" />
      </svg>
    </span>
  );
}

export function Logo({ size = 40, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <LogoMark size={size} />
      {withWord && (
        <span className="leading-tight">
          <span className="block text-[17px] font-semibold tracking-tight">Pulse</span>
          <span className="block text-[13px] text-ink-muted">Plaksha</span>
        </span>
      )}
    </span>
  );
}

/** Standard page heading: a title, one quiet line under it, and at most one action. */
export function PageHeader({ title, sub, action, back }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; back?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {back}
        <h1 className="title">{title}</h1>
        {sub && <p className="mt-1.5 max-w-xl text-[15px] text-ink-muted">{sub}</p>}
      </div>
      {action}
    </header>
  );
}
