"use client";

import { Check, Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/format";
import { reviewContent } from "@/server/actions/review";
import { Button } from "./ui";

type Kind = "issue" | "proposal" | "comment" | "post" | "reason";
type Approval = "pending" | "approved" | "rejected";

/** Approve or reject one pending item. Rejecting asks for a short reason, which the author is shown. */
export function ReviewActions({ kind, id, size = "sm", className }: { kind: Kind; id: string; size?: "sm" | "md"; className?: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await reviewContent({ kind, id, approve, note: approve ? undefined : note });
      if (!r.ok) toast.error(r.error);
      else toast.success(approve ? "Approved. It's public now." : "Rejected. The author has been told.");
      setRejecting(false);
      router.refresh();
    });

  if (rejecting)
    return (
      <div className={cn("flex flex-wrap items-center gap-2 animate-rise", className)}>
        <input
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          onKeyDown={(e) => e.key === "Enter" && decide(false)}
          placeholder="Reason, shown to the author (optional)"
          aria-label="Reason for rejecting"
          className="h-9 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-sm outline-none placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
        />
        <Button size={size} variant="danger" disabled={pending} onClick={() => decide(false)}>
          Reject
        </Button>
        <Button size={size} variant="ghost" disabled={pending} onClick={() => setRejecting(false)}>
          Cancel
        </Button>
      </div>
    );
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button size={size} disabled={pending} onClick={() => decide(true)}>
        <Check size={15} strokeWidth={2.4} aria-hidden /> Approve
      </Button>
      <Button size={size} variant="secondary" disabled={pending} onClick={() => setRejecting(true)}>
        <X size={15} aria-hidden /> Reject
      </Button>
    </div>
  );
}

/** Small tag on a comment or post that isn't public yet. Only its author and moderators ever see it. */
export function ApprovalTag({ approval }: { approval: Approval }) {
  if (approval === "approved") return null;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium", approval === "pending" ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger")}>
      {approval === "pending" ? <Clock size={12} aria-hidden /> : <X size={12} aria-hidden />}
      {approval === "pending" ? "Waiting for approval" : "Not approved"}
    </span>
  );
}

/**
 * Banner at the top of an issue or proposal that isn't public. The author sees where it stands;
 * a moderator sees the same banner with the decision buttons in it.
 */
export function ApprovalBanner({
  kind,
  id,
  approval,
  hidden,
  reason,
  canReview,
  mine,
}: {
  kind: "issue" | "proposal";
  id: string;
  approval: Approval;
  hidden: boolean;
  reason: string | null;
  canReview: boolean;
  mine: boolean;
}) {
  if (!hidden) return null;
  const what = kind === "issue" ? "report" : "proposal";
  if (approval === "pending")
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-accent-soft p-5 text-accent-ink">
        <Clock size={20} className="shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <b className="font-semibold">Waiting for a moderator.</b>{" "}
          {mine ? `Only you and the moderators can see this ${what} until it's approved. You'll get an update either way.` : `Nobody else can see this ${what} until you approve it.`}
        </div>
        {canReview && <ReviewActions kind={kind} id={id} size="md" className="text-ink" />}
      </div>
    );
  return (
    <div className="flex items-start gap-3 rounded-3xl bg-danger-soft p-5 text-sm text-danger">
      <X size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <b className="font-semibold">{approval === "rejected" ? "Not approved." : "Hidden from everyone else."}</b> Only {mine ? "you and the moderators" : "the author and moderators"} can see this.
        {reason && <div className="mt-0.5 opacity-85">Reason: {reason}</div>}
      </div>
    </div>
  );
}
