"use client";

import { Hand } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/format";
import { toggleMetoo } from "@/server/actions/issues";

type Props = {
  issueId: string;
  count: number;
  voted: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  isReporter?: boolean;
};

/** Remounts when fresh server data arrives (live refresh), so local state never goes stale. */
export function MetooButton(props: Props) {
  return <MetooInner key={`${props.count}:${props.voted}`} {...props} />;
}

function MetooInner({
  issueId,
  count,
  voted,
  disabled,
  size = "md",
  isReporter = false,
}: Props) {
  const [state, setState] = useState({ count, voted });
  const [optimistic, apply] = useOptimistic(state, (s, v: boolean) => ({ voted: v, count: s.count + (v ? 1 : -1) }));
  const [, start] = useTransition();
  const [bump, setBump] = useState(0);

  const click = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (isReporter && optimistic.voted) {
      toast("You reported this — you're already counted.");
      return;
    }
    const next = !optimistic.voted;
    if (next) setBump((b) => b + 1);
    start(async () => {
      apply(next);
      const r = await toggleMetoo(issueId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setState({ count: r.metooCount, voted: r.voted });
      if (r.voted) toast.success("Counted. You'll get updates on this one.", { duration: 2200 });
    });
  };

  if (size === "lg")
    return (
      <button
        onClick={click}
        disabled={disabled}
        aria-pressed={optimistic.voted}
        className={cn(
          "group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all",
          optimistic.voted ? "border-brand bg-brand-soft" : "border-line-strong bg-surface hover:border-brand hover:bg-brand-soft/50",
          disabled && "opacity-60",
        )}
      >
        <span
          key={bump}
          className={cn(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-full transition-colors",
            optimistic.voted ? "bg-brand text-brand-ink animate-pop" : "bg-surface-2 text-ink-2 group-hover:bg-brand group-hover:text-brand-ink",
          )}
        >
          <Hand size={22} />
        </span>
        <span className="min-w-0">
          <span className="font-display block text-3xl leading-none tabular">{optimistic.count}</span>
          <span className="mt-1 block text-sm text-ink-muted">
            {optimistic.voted ? (isReporter ? "You reported this" : "You're affected — following") : disabled ? "people were affected" : "Affected too? Add yourself"}
          </span>
        </span>
      </button>
    );

  return (
    <button
      onClick={click}
      disabled={disabled}
      aria-pressed={optimistic.voted}
      aria-label={`${optimistic.voted ? "Remove me too" : "Me too"} (${optimistic.count})`}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-xl border tabular transition-all",
        size === "sm" ? "h-12 w-12" : "h-14 w-14",
        optimistic.voted ? "border-brand bg-brand-soft text-brand" : "border-line-strong bg-surface text-ink-2 hover:border-brand hover:text-brand",
        disabled && "opacity-60",
      )}
    >
      <Hand key={bump} size={size === "sm" ? 14 : 16} className={cn(optimistic.voted && "animate-pop")} />
      <span className={cn("font-semibold leading-tight", size === "sm" ? "text-[13px]" : "text-[15px]")}>{optimistic.count}</span>
    </button>
  );
}
