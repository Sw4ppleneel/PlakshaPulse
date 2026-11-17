"use client";

import { Bell, BellOff, Camera, CheckCircle2, EyeOff, Flag, GitMerge, Loader2, RotateCcw, Send, ShieldCheck, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { FLAG_REASONS, MAX_PHOTOS, STATUS_META, TRANSITIONS, type Status } from "@/lib/constants";
import { cn } from "@/lib/format";
import { addComment, flagContent, toggleWatch, verifyFix } from "@/server/actions/issues";
import { mergeIssue, moderate, reassignIssue, updateStatus } from "@/server/actions/manage";

export function NewIssueToast({ metooCount, pending }: { metooCount: number; pending: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (sp.get("new") === "1" && !done.current) {
      done.current = true;
      if (pending) toast.success("Sent for approval", { description: "A moderator will look at it shortly. It goes on the board as soon as it's approved.", duration: 5000 });
      else
        toast.success("Posted! It's live on the board.", {
          description: metooCount > 1 ? `${metooCount} people affected so far.` : "Share it — every me-too makes it bigger. You'll be notified on each update.",
          duration: 5000,
        });
      router.replace(window.location.pathname, { scroll: false });
    }
  }, [sp, router, metooCount, pending]);
  return null;
}

export function WatchButton({ issueId, watching }: { issueId: string; watching: boolean }) {
  const [w, setW] = useState(watching);
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await toggleWatch(issueId);
          if (!r.ok) return void toast.error(r.error);
          setW(r.watching);
          toast(r.watching ? "You'll get updates on this issue." : "Stopped following.");
        })
      }
    >
      {w ? <BellOff size={14} /> : <Bell size={14} />} {w ? "Following" : "Follow"}
    </Button>
  );
}

export function FlagButton({ targetType, targetId, compact }: { targetType: "issue" | "comment"; targetId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return <span className="text-xs text-ink-muted">Reported — thanks</span>;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-danger" aria-expanded={open}>
        <Flag size={12} /> {compact ? "" : "Report"}
      </button>
      {open && (
        <div className="card absolute right-0 top-6 z-30 w-60 p-1.5 !shadow-[var(--shadow-pop)] animate-rise">
          <div className="px-2.5 py-1.5 text-xs font-semibold text-ink-muted">Why should a moderator look?</div>
          {FLAG_REASONS.map((r) => (
            <button
              key={r}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await flagContent({ targetType, targetId, reason: r });
                  if (!res.ok) return void toast.error(res.error);
                  setDone(true);
                  setOpen(false);
                })
              }
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VerifyCard({ issueId, fixed, broken, viewer, eligible }: { issueId: string; fixed: number; broken: number; viewer: "fixed" | "broken" | null; eligible: boolean }) {
  const [mode, setMode] = useState<"ask" | "broken">("ask");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const send = (isFixed: boolean) =>
    start(async () => {
      const r = await verifyFix({ issueId, fixed: isFixed, note: note || undefined });
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        r.outcome === "reopened" ? "Reopened. The department has been notified." : r.outcome === "closed" ? "Verified fixed — thanks for closing the loop!" : "Thanks — your answer is counted.",
      );
      router.refresh();
    });

  return (
    <div className="rounded-2xl border-2 border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-accent-soft p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-[#3a2a00]">
          <CheckCircle2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Marked fixed. Is it actually fixed?</div>
          <p className="mt-0.5 text-sm text-ink-2">
            People who reported this decide. Two “still broken” answers reopen it; no reply in 7 days closes it.
            <span className="ml-1 tabular text-ink-muted">
              ({fixed} fixed · {broken} still broken)
            </span>
          </p>
          {viewer ? (
            <p className="mt-3 text-sm font-medium">You said: {viewer === "fixed" ? "✅ fixed" : "❌ still broken"}</p>
          ) : !eligible ? (
            <p className="mt-3 text-xs text-ink-muted">Only people who reported or me-too&apos;d this can answer.</p>
          ) : mode === "ask" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => send(true)} disabled={pending}>
                <CheckCircle2 size={15} /> Yes, it&apos;s fixed
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMode("broken")} disabled={pending}>
                <RotateCcw size={15} /> Still broken
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="What's still wrong?"
                className="w-full rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="danger" disabled={pending || note.trim().length < 5} onClick={() => send(false)}>
                  {pending && <Loader2 size={14} className="animate-spin" />} Reopen request
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMode("ask")}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommentComposer({ issueId, canOfficial, departmentName, closed }: { issueId: string; canOfficial: boolean; departmentName: string; closed: boolean }) {
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [official, setOfficial] = useState(canOfficial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className={cn("card p-3 sm:p-4", official && "ring-2 ring-brand/40")}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder={official ? `Post an official update as ${departmentName}…` : closed ? "Add a note (this issue is closed)…" : "Add details, or say how it affects you…"}
        className="w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed outline-none placeholder:text-ink-muted"
        aria-label="Comment"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {canOfficial ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} className="accent-[var(--brand)]" />
            <ShieldCheck size={14} className="text-brand" /> Official update from {departmentName}
          </label>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-muted">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-[var(--brand)]" />
            <EyeOff size={13} /> Anonymous
          </label>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={pending || body.trim().length < 2}
          onClick={() =>
            start(async () => {
              const r = await addComment({ issueId, body, anonymous, official });
              if (!r.ok) return void toast.error(r.error);
              if (r.pending) toast.success("Sent for approval. It shows here once a moderator approves it.");
              setBody("");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post
        </Button>
      </div>
    </div>
  );
}

export function ManagePanel({
  issueId,
  status,
  departmentId,
  departments,
  isAdmin,
  hidden,
}: {
  issueId: string;
  status: Status;
  departmentId: string;
  departments: { id: string; name: string }[];
  isAdmin: boolean;
  hidden: boolean;
}) {
  const router = useRouter();
  const [to, setTo] = useState<Status | "">("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [dept, setDept] = useState(departmentId);
  const [mergeNo, setMergeNo] = useState("");
  const [hiding, setHiding] = useState(false);
  const [hideReason, setHideReason] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const options = TRANSITIONS[status].filter((s) => s !== "closed" || isAdmin);
  const needsNote = to === "resolved" || to === "wont_fix";

  const apply = () =>
    start(async () => {
      if (!to) return;
      const fd = new FormData();
      fd.set("issueId", issueId);
      fd.set("to", to);
      fd.set("note", note);
      photos.forEach((p) => fd.append("photos", p));
      const r = await updateStatus(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Moved to ${STATUS_META[to].label}. Everyone following was notified.`);
      setTo("");
      setNote("");
      setPhotos([]);
      router.refresh();
    });

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-brand-soft px-4 py-3 text-sm font-semibold text-brand">
        <ShieldCheck size={16} /> Manage this issue
      </div>
      <div className="space-y-5 p-4">
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-muted">Update status</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((s) => (
              <button
                key={s}
                onClick={() => setTo(to === s ? "" : s)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  to === s ? "border-transparent bg-ink text-bg" : "border-transparent bg-surface-2 hover:bg-surface-3",
                )}
              >
                {s === "in_progress" && (status === "resolved" || status === "closed") ? "Reopen" : STATUS_META[s].label}
              </button>
            ))}
          </div>
          {to && (
            <div className="mt-3 space-y-2 animate-rise">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 2000))}
                rows={3}
                placeholder={
                  to === "resolved"
                    ? "What was done? Reporters will check this. (required)"
                    : to === "wont_fix"
                      ? "Public reason it won't be fixed (required)"
                      : "Optional public note"
                }
                className="w-full rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
              />
              {to === "resolved" && (
                <div className="flex flex-wrap items-center gap-2">
                  {photos.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs">
                      {p.name.slice(0, 16)}
                      <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="Remove">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                      <Camera size={13} /> Add &quot;after&quot; photo
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => e.target.files?.[0] && setPhotos([...photos, e.target.files[0]])}
                  />
                </div>
              )}
              <Button size="sm" className="w-full" onClick={apply} disabled={pending || (needsNote && note.trim().length < 10)}>
                {pending && <Loader2 size={14} className="animate-spin" />} Publish update
              </Button>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold text-ink-muted">Route to department</div>
          <div className="flex gap-2">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 min-w-0 flex-1 rounded-full bg-surface-2 px-2 text-sm">
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || dept === departmentId}
              onClick={() =>
                start(async () => {
                  const r = await reassignIssue({ issueId, departmentId: dept });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Routed.");
                  router.refresh();
                })
              }
            >
              Move
            </Button>
          </div>
        </div>

        {status !== "duplicate" && (
          <div>
            <div className="mb-2 text-xs font-semibold text-ink-muted">Merge duplicate into</div>
            <div className="flex gap-2">
              <input
                value={mergeNo}
                onChange={(e) => setMergeNo(e.target.value.replace(/\D/g, ""))}
                placeholder="Issue #"
                inputMode="numeric"
                className="h-9 min-w-0 flex-1 rounded-full bg-surface-2 px-3 text-sm"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={pending || !mergeNo}
                onClick={() =>
                  start(async () => {
                    const r = await mergeIssue({ issueId, targetNumber: Number(mergeNo) });
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`Merged into #${r.targetNumber}. Me-toos moved over.`);
                    router.push(`/issues/${r.targetNumber}`);
                  })
                }
              >
                <GitMerge size={14} /> Merge
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export function HideCommentButton({ commentId, hidden }: { commentId: string; hidden: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await moderate({ targetType: "comment", targetId: commentId, hide: !hidden });
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        })
      }
      className="text-xs text-ink-muted hover:text-danger"
    >
      {hidden ? "Restore" : "Hide"}
    </button>
  );
}

/**
 * Hide or restore a live issue. For moderators and admins, on any issue (not only flagged ones).
 * Items waiting for approval are decided with the banner's Approve/Reject instead.
 */
export function ModerateIssue({ issueId, hidden }: { issueId: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="card space-y-2 p-4">
      <div className="label">Moderation</div>
      {!hidden && hiding && (
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 300))}
          placeholder="Reason (shown to the reporter and in the log)"
          aria-label="Reason for hiding"
          className="h-10 w-full rounded-full bg-surface-2 px-4 text-sm outline-none focus:bg-surface focus:ring-2 focus:ring-brand"
        />
      )}
      <Button
        size="sm"
        variant={hidden ? "secondary" : "ghost"}
        className={cn("w-full", !hidden && "!text-danger")}
        disabled={pending || (hiding && reason.trim().length < 3)}
        onClick={() => {
          if (!hidden && !hiding) return setHiding(true);
          start(async () => {
            const r = await moderate({ targetType: "issue", targetId: issueId, hide: !hidden, reason: reason || undefined });
            if (!r.ok) return void toast.error(r.error);
            toast.success(hidden ? "Restored. It's public again." : "Hidden from the board.");
            setHiding(false);
            setReason("");
            router.refresh();
          });
        }}
      >
        <EyeOff size={14} aria-hidden /> {hidden ? "Restore to the board" : hiding ? "Confirm hide" : "Hide from the board"}
      </Button>
      {hiding && (
        <Button size="sm" variant="ghost" className="w-full" disabled={pending} onClick={() => setHiding(false)}>
          Cancel
        </Button>
      )}
    </div>
  );
}
