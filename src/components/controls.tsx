"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { SPRING } from "./motion";

/** URL-backed filter state: every control on a list page reads and writes the query string. */
export function useQueryState() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${path}?${qs}` : path, { scroll: false }));
  };
  return { sp, set, pending };
}

/** A track with a pill that slides to the selected option. Arrow keys move the selection. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  tone = "surface",
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; aria?: string }[];
  label: string;
  tone?: "surface" | "soft";
  size?: "sm" | "md";
  className?: string;
}) {
  const id = useId();
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    onChange(options[(i + dir + options.length) % options.length]!.value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center rounded-full p-1", tone === "surface" ? "bg-surface shadow-card" : "bg-surface-2", size === "md" ? "h-11" : "h-9", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") move(1);
        if (e.key === "ArrowLeft") move(-1);
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={selected}
            aria-label={o.aria}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex h-full min-w-9 flex-1 items-center justify-center rounded-full text-sm font-medium transition-colors duration-200",
              size === "md" ? "px-4" : "px-2.5",
              selected ? "text-bg" : "text-ink-muted hover:text-ink",
            )}
          >
            {selected && <motion.span layoutId={`seg-${id}`} transition={SPRING} className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A selectable chip. Selected chips turn solid ink. */
export function Pill({ selected, onClick, children, className }: { selected?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected}
      whileTap={{ scale: 0.95 }}
      transition={SPRING}
      className={cn(
        "inline-flex h-9 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors duration-200",
        selected ? "bg-ink text-bg" : "bg-surface-2 text-ink-2 hover:bg-surface-3",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export function SearchField({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-full bg-surface pl-11 pr-10 text-[15px] shadow-card outline-none placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand"
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Clear search">
          <X size={15} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Everything that isn't the primary filter lives behind one button. On phones it is a sheet that
 * springs up from the bottom; from sm up it is a popover under the button.
 */
export function FilterMenu({ count, onClear, children, title = "Filters" }: { count: number; onClear: () => void; children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="sm:relative">
      <button
        ref={trigger}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium shadow-card transition-colors duration-200 active:scale-[0.97]",
          count ? "bg-ink text-bg" : "bg-surface text-ink-2 hover:text-ink",
        )}
      >
        <SlidersHorizontal size={16} strokeWidth={1.9} aria-hidden />
        Filters
        {count > 0 && <span className="inline-flex size-5 items-center justify-center rounded-full bg-mint text-[11px] font-semibold text-brand-ink tabular">{count}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              ref={panel}
              id={id}
              role="dialog"
              aria-label={title}
              tabIndex={-1}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[28px] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] outline-none sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[3.25rem] sm:w-[360px] sm:rounded-[28px] sm:pb-5"
              style={{ transformOrigin: "top right" }}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0, transition: SPRING }}
              exit={{ opacity: 0, y: 12, transition: { duration: 0.14 } }}
            >
              <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-surface-3 sm:hidden" aria-hidden />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">{title}</h2>
                {count > 0 && (
                  <button onClick={onClear} className="text-[13px] font-medium text-brand hover:underline">
                    Clear all
                  </button>
                )}
              </div>
              <div className="space-y-5">{children}</div>
              <button onClick={() => setOpen(false)} className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-ink text-sm font-semibold text-bg active:scale-[0.98] sm:hidden">
                Done
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
      {children}
    </div>
  );
}

/** A filter that is switched on, shown under the toolbar so it can be removed in one tap. */
export function ActiveFilter({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
      transition={SPRING}
      onClick={onRemove}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface pl-3 pr-2 text-[13px] font-medium text-ink-2 shadow-card hover:text-ink"
    >
      {children}
      <X size={14} className="text-ink-muted" aria-hidden />
      <span className="sr-only">Remove filter</span>
    </motion.button>
  );
}
