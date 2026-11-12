"use client";

import { LayoutGrid, List, Search, Shapes, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import { CategoryIcon } from "./ui";

type Cat = { id: string; name: string; icon: string; color: string };
type Loc = { id: string; name: string; zone: string };

export function BoardToolbar({ categories, locations, counts }: { categories: Cat[]; locations: Loc[]; counts: Record<string, number> }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = sp.get("view") ?? "active";
  const mode = sp.get("mode") ?? "bubbles";
  const group = sp.get("group") === "category";
  const cat = sp.get("category");

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={(v) => set({ view: v === "active" ? null : v })}
          options={[
            ["active", "Active"],
            ["fixed", "Fixed"],
            ["all", "All"],
          ]}
        />
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search issues or #number"
            className="h-10 w-full rounded-full border border-line-strong bg-surface pl-9 pr-8 text-sm outline-none placeholder:text-ink-muted focus:border-brand"
            aria-label="Search issues"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink" aria-label="Clear search">
              <X size={15} />
            </button>
          )}
        </div>
        <select
          value={sp.get("location") ?? ""}
          onChange={(e) => set({ location: e.target.value || null })}
          className="h-10 max-w-[200px] rounded-full border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand"
          aria-label="Filter by location"
        >
          <option value="">All locations</option>
          {["Residential", "Dining", "Academic", "Common", "Sports"].map((z) => (
            <optgroup key={z} label={z}>
              {locations
                .filter((l) => l.zone === z)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {mode === "list" ? (
            <select
              value={sp.get("sort") ?? "hot"}
              onChange={(e) => set({ sort: e.target.value === "hot" ? null : e.target.value })}
              className="h-10 rounded-full border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand"
              aria-label="Sort"
            >
              <option value="hot">Trending</option>
              <option value="top">Most affected</option>
              <option value="new">Newest</option>
              <option value="updated">Recently updated</option>
            </select>
          ) : (
            <button
              onClick={() => set({ group: group ? null : "category" })}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                group ? "border-brand bg-brand-soft text-brand" : "border-line-strong bg-surface text-ink-2 hover:text-ink",
              )}
              aria-pressed={group}
            >
              <Shapes size={15} /> Group
            </button>
          )}
          <Segmented
            value={mode}
            onChange={(v) => set({ mode: v === "bubbles" ? null : v })}
            options={[
              ["bubbles", <LayoutGrid key="b" size={15} aria-label="Bubbles" />],
              ["list", <List key="l" size={15} aria-label="List" />],
            ]}
          />
        </div>
      </div>
      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={!cat} onClick={() => set({ category: null })}>
          All <span className="text-ink-muted tabular">{Object.values(counts).reduce((a, b) => a + b, 0)}</span>
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={cat === c.id} onClick={() => set({ category: cat === c.id ? null : c.id })} color={c.color}>
            <CategoryIcon icon={c.icon} color={c.color} size={14} />
            {c.name}
            {counts[c.id] ? <span className="text-ink-muted tabular">{counts[c.id]}</span> : null}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors",
        active ? "border-transparent bg-ink text-bg [&_span]:text-bg/70" : "border-line bg-surface text-ink-2 hover:border-line-strong",
      )}
      style={active && color ? { background: color, color: "#fff" } : undefined}
    >
      {children}
    </button>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, React.ReactNode][] }) {
  return (
    <div className="inline-flex h-10 items-center rounded-full border border-line-strong bg-surface p-1" role="tablist">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex h-full min-w-9 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors",
            value === v ? "bg-ink text-bg" : "text-ink-muted hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
