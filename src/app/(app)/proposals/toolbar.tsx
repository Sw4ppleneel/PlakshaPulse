"use client";

import { LayoutGrid, List } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { ActiveFilter, FilterGroup, FilterMenu, Pill, Segmented, useQueryState } from "@/components/controls";
import { AREAS } from "@/lib/constants";
import { cn } from "@/lib/format";

const SORTS = [
  ["moving", "Moving fastest"],
  ["new", "Newest"],
  ["updated", "Recently moved"],
  ["top", "Most supported"],
] as const;

/** One row: which proposals, filters, view. Area and sort sit inside Filters. */
export function ProposalToolbar() {
  const { sp, set, pending } = useQueryState();
  const show = (sp.get("show") ?? "open") as "open" | "done" | "mine";
  const mode = (sp.get("mode") ?? "cards") as "cards" | "list";
  const sort = sp.get("sort") ?? "moving";
  const area = sp.get("area");
  const areaLabel = AREAS.find((a) => a.id === area)?.label;
  const active = [area, sp.get("sort")].filter(Boolean).length;

  return (
    <div className={cn("space-y-3 transition-opacity duration-200", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Which proposals"
          value={show}
          onChange={(v) => set({ show: v === "open" ? null : v })}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Decided" },
            { value: "mine", label: "Mine" },
          ]}
          className="w-full sm:w-auto"
        />
        <div className="ml-auto flex items-center gap-2">
          <FilterMenu count={active} onClear={() => set({ area: null, sort: null })}>
            <FilterGroup label="Area">
              <div className="flex flex-wrap gap-1.5">
                {AREAS.map((a) => (
                  <Pill key={a.id} selected={area === a.id} onClick={() => set({ area: area === a.id ? null : a.id })}>
                    {a.label}
                  </Pill>
                ))}
              </div>
            </FilterGroup>
            <FilterGroup label="Sort by">
              <div className="flex flex-wrap gap-1.5">
                {SORTS.map(([v, l]) => (
                  <Pill key={v} selected={sort === v} onClick={() => set({ sort: v === "moving" ? null : v })}>
                    {l}
                  </Pill>
                ))}
              </div>
            </FilterGroup>
          </FilterMenu>
          <Segmented
            label="View"
            value={mode}
            onChange={(v) => set({ mode: v === "cards" ? null : v })}
            options={[
              { value: "cards", label: <LayoutGrid size={16} aria-hidden />, aria: "Cards" },
              { value: "list", label: <List size={16} aria-hidden />, aria: "List with dates" },
            ]}
            className="[&_button]:px-3"
          />
        </div>
      </div>
      {areaLabel && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            <ActiveFilter key="area" onRemove={() => set({ area: null })}>
              {areaLabel}
            </ActiveFilter>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
