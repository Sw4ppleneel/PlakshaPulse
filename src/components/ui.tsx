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
  open: "bg-surface-2 text-ink-2 ring-line-strong",
  acknowledged: "bg-[color-mix(in_srgb,var(--aqua)_12%,transparent)] text-[var(--aqua)] ring-[color-mix(in_srgb,var(--aqua)_30%,transparent)]",
  in_progress: "bg-brand-soft text-brand ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]",
  resolved: "bg-accent-soft text-accent-ink ring-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
  closed: "bg-ok-soft text-ok ring-[color-mix(in_srgb,var(--ok)_30%,transparent)]",
  wont_fix: "bg-surface-2 text-ink-muted ring-line",
  duplicate: "bg-surface-2 text-ink-muted ring-line",
};

const STATUS_DOT: Record<Status, string> = {
  open: "border border-dashed border-ink-muted",
  acknowledged: "bg-aqua",
  in_progress: "bg-brand animate-pulse",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular",
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
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 42% 42%)` }}
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
    "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-6 text-[15px]",
    variant === "primary" && "bg-brand text-brand-ink shadow-[0_1px_0_rgb(255_255_255/.2)_inset,0_6px_16px_-6px_color-mix(in_srgb,var(--brand)_70%,transparent)] hover:bg-brand-strong",
    variant === "accent" && "bg-accent text-[#3d2a00] hover:brightness-95",
    variant === "secondary" && "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2",
    variant === "danger" && "bg-danger text-white hover:brightness-95",
    className,
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "ok" | "warn" | "danger" }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div
        className={cn(
          "font-display mt-1 text-[28px] leading-none tabular sm:text-[32px]",
          tone === "brand" && "text-brand",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-2 text-ink-muted">{icon}</div>}
      <div className="font-display text-xl">{title}</div>
      {children && <div className="max-w-sm text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Logo({ size = 28, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <circle cx="12" cy="18" r="9.5" fill="var(--brand)" />
        <circle cx="22.5" cy="11" r="6" fill="var(--aqua)" opacity=".9" />
        <circle cx="24.5" cy="23.5" r="3.6" fill="var(--accent)" />
        <path d="M6.5 18h3l1.6-3.6 2.4 7.2 1.6-3.6h2.4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWord && (
        <span className="leading-none">
          <span className="font-display block text-[19px] font-semibold tracking-tight">Pulse</span>
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ink-muted">Plaksha</span>
        </span>
      )}
    </span>
  );
}
