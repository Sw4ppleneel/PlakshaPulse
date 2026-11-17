"use client";

import { LayoutGrid, List } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/format";
import { ActiveFilter, FilterGroup, FilterMenu, Pill, SearchField, Segmented, useQueryState } from "./controls";

type Cat = { id: string; name: string; icon: string; color: string };
type Loc = { id: string; name: string; zone: string };

const SORTS = [
  ["hot", "Trending"],
  ["top", "Most affected"],
  ["new", "Newest"],
  ["updated", "Recently updated"],
] as const;

/**
 * One row: which issues, search, filters, view. Category, location, sort and grouping sit inside
 * Filters; whatever is switched on shows as a removable chip underneath.
 */
export function BoardToolbar({ categories, locations, counts }: { categories: Cat[]; locations: Loc[]; counts: Record<string, number> }) {
  const { sp, set, pending } = useQueryState();
  const [q, setQ] = useState(sp.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = (sp.get("view") ?? "active") as "active" | "fixed" | "all";
  const mode = (sp.get("mode") ?? "bubbles") as "bubbles" | "list";
  const group = sp.get("group") === "category";
  const cat = sp.get("category");
  const loc = sp.get("location");
  const sort = sp.get("sort") ?? (view === "fixed" ? "updated" : "hot");
  const catName = categories.find((c) => c.id === cat)?.name;
  const locName = locations.find((l) => l.id === loc)?.name;
  const active = [cat, loc, group ? "g" : null, sp.get("sort")].filter(Boolean).length;

  return (
    <div className={cn("space-y-3 transition-opacity duration-200", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Which issues"
          value={view}
          onChange={(v) => set({ view: v === "active" ? null : v })}
          options={[
            { value: "active", label: "Active" },
            { value: "fixed", label: "Fixed" },
            { value: "all", label: "All" },
          ]}
          className="w-full sm:w-auto"
        />
        <SearchField value={q} onChange={setQ} placeholder="Search" label="Search issues or #number" className="min-w-0 flex-1 sm:ml-auto sm:max-w-[240px]" />
        <FilterMenu count={active} onClear={() => set({ category: null, location: null, group: null, sort: null })}>
          <FilterGroup label="Category">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Pill key={c.id} selected={cat === c.id} onClick={() => set({ category: cat === c.id ? null : c.id })}>
                  {c.name}
                  {counts[c.id] ? <span className="tabular opacity-60">{counts[c.id]}</span> : null}
                </Pill>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup label="Location">
            <select value={loc ?? ""} onChange={(e) => set({ location: e.target.value || null })} className="field" aria-label="Location">
              <option value="">Anywhere on campus</option>
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
          </FilterGroup>
          {mode === "list" ? (
            <FilterGroup label="Sort by">
              <div className="flex flex-wrap gap-1.5">
                {SORTS.map(([v, l]) => (
                  <Pill key={v} selected={sort === v} onClick={() => set({ sort: v === "hot" ? null : v })}>
                    {l}
                  </Pill>
                ))}
              </div>
            </FilterGroup>
          ) : (
            <FilterGroup label="Layout">
              <div className="flex flex-wrap gap-1.5">
                <Pill selected={!group} onClick={() => set({ group: null })}>
                  One cluster
                </Pill>
                <Pill selected={group} onClick={() => set({ group: "category" })}>
                  Grouped by category
                </Pill>
              </div>
            </FilterGroup>
          )}
        </FilterMenu>
        <Segmented
          label="View"
          value={mode}
          onChange={(v) => set({ mode: v === "bubbles" ? null : v })}
          options={[
            { value: "bubbles", label: <LayoutGrid size={16} aria-hidden />, aria: "Bubbles" },
            { value: "list", label: <List size={16} aria-hidden />, aria: "List" },
          ]}
          className="[&_button]:px-3"
        />
      </div>
      {(catName || locName) && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {catName && (
              <ActiveFilter key="cat" onRemove={() => set({ category: null })}>
                {catName}
              </ActiveFilter>
            )}
            {locName && (
              <ActiveFilter key="loc" onRemove={() => set({ location: null })}>
                {locName}
              </ActiveFilter>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
