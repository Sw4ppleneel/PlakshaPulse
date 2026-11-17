"use client";

import { Check, ChevronDown, EyeOff, FlaskConical, HandHeart, Megaphone, Send, Share2, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { inputClass } from "@/components/proposal-ui";
import { Button } from "@/components/ui";
import { AUTHOR_MOVES, COHORTS, STAGE_META, STAGE_MOVES, TRIAL_RATINGS, USAGE_META, type Stage } from "@/lib/constants";
import { cn } from "@/lib/format";
import { checkIn, moveProposal, postOnProposal, setPostHidden, setProposalHidden, supportProposal, withdrawSupport } from "@/server/actions/proposals";

type Usage = keyof typeof USAGE_META;
type Support = { usage: Usage; volunteer: boolean; showName: boolean; reason: string | null; reasonApproval: "pending" | "approved" | "rejected" } | null;

/* ───────────────────────── Support ───────────────────────── */

export function SupportPanel({
  proposalId,
  count,
  goal,
  support,
  cohort,
  open,
  isAuthor,
}: {
  proposalId: string;
  count: number;
  goal: number;
  support: Support;
  cohort: string | null;
  open: boolean;
  isAuthor: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [usage, setUsage] = useState<Usage>(support?.usage ?? "often");
  const [volunteer, setVolunteer] = useState(support?.volunteer ?? false);
  const [showName, setShowName] = useState(support?.showName ?? true);
  const [reason, setReason] = useState(support?.reason ?? "");
  const [group, setGroup] = useState(cohort ?? "");
  const [pending, start] = useTransition();
  const met = count >= goal;

  const submit = () =>
    start(async () => {
      if (!group) {
        toast.error("Pick your batch or group — it's what makes the numbers useful.");
        return;
      }
      const r = await supportProposal({ proposalId, usage, volunteer, showName, reason, cohort: group as (typeof COHORTS)[number] });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.isNew ? `You're supporter #${r.supportCount}. You'll hear when this moves.` : "Updated.", r.reasonPending ? { description: "Your reason shows publicly once a moderator approves it." } : undefined);
      setEditing(false);
      router.refresh();
    });

  const withdraw = () =>
    start(async () => {
      const r = await withdrawSupport(proposalId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast("Support withdrawn.");
      setEditing(false);
      router.refresh();
    });

  return (
    <div className={cn("card overflow-hidden", support && "border-brand")}>
      <div className={cn("p-5", support && "bg-brand-soft")}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-[44px] leading-none tabular">{count}</div>
            <div className="mt-1 text-sm text-ink-muted">verified {count === 1 ? "supporter" : "supporters"}</div>
          </div>
          <div className={cn("text-right text-xs", met ? "font-semibold text-ok" : "text-ink-muted")}>{met ? "Goal reached" : `Goal ${goal}`}</div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div className={cn("h-full rounded-full transition-[width] duration-700", met ? "bg-ok" : "bg-mint")} style={{ width: `${Math.max(3, Math.min(100, (count / goal) * 100))}%` }} />
        </div>

        {support && !editing && (
          <div className="mt-4 flex items-center justify-between gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
              <Check size={16} strokeWidth={3} /> {isAuthor ? "You proposed this" : "You support this"}
            </span>
            {open && (
              <button className="text-xs font-semibold text-ink-muted hover:text-ink" onClick={() => setEditing(true)}>
                Edit my response
              </button>
            )}
          </div>
        )}
        {!support && !editing && open && (
          <Button size="lg" className="mt-4 w-full" onClick={() => setEditing(true)}>
            <ThumbsUp size={18} /> I want this
          </Button>
        )}
        {!open && !support && <p className="mt-4 text-sm text-ink-muted">This proposal is closed. Its evidence is frozen as it stood.</p>}
      </div>

      {editing && (
        <div className="space-y-4 border-t border-line p-5 animate-rise">
          <fieldset>
            <legend className="text-sm font-semibold">Would you actually use it?</legend>
            <div className="mt-2 space-y-1.5">
              {(Object.keys(USAGE_META) as Usage[]).map((k) => (
                <label
                  key={k}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    usage === k ? "border-transparent bg-ink font-medium text-bg" : "border-transparent bg-surface-2 hover:bg-surface-3",
                  )}
                >
                  <input type="radio" name="usage" className="accent-[var(--brand)]" checked={usage === k} onChange={() => setUsage(k)} />
                  {USAGE_META[k].label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="cohort" className="text-sm font-semibold">
              Your batch or group
            </label>
            <div className="relative mt-2">
              <select id="cohort" value={group} onChange={(e) => setGroup(e.target.value)} className={cn(inputClass, "h-11 appearance-none pr-9 text-sm")}>
                <option value="">Choose…</option>
                {COHORTS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {group && !COHORTS.includes(group as (typeof COHORTS)[number]) && <option>{group}</option>}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            </div>
          </div>

          <div>
            <label htmlFor="reason" className="text-sm font-semibold">
              Why does this matter to you? <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 280))}
              rows={2}
              placeholder="One line the office will read."
              className={cn(inputClass, "mt-2 resize-none py-2.5 text-sm leading-relaxed")}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={volunteer} onChange={(e) => setVolunteer(e.target.checked)} />
            <span>
              <b className="font-semibold">I&apos;ll help make it happen</b>
              <span className="block text-xs text-ink-muted">Count me as a volunteer for the trial run.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
            <span>
              <b className="font-semibold">Show my name on the supporter list</b>
              <span className="block text-xs text-ink-muted">Off: you still count, listed only by batch.</span>
            </span>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={pending} className="flex-1">
              {support ? "Save" : "Add my support"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
          {support && !isAuthor && (
            <button onClick={withdraw} disabled={pending} className="text-xs font-medium text-danger hover:underline">
              Withdraw my support
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ShareButton({ title, count }: { title: string; count: number }) {
  const share = async () => {
    const url = window.location.href;
    const text = `${title} — ${count} people at Plaksha want this. Add yourself:`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* dismissed */
      }
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast.success("Link copied. Drop it in your batch group.");
  };
  return (
    <Button variant="secondary" className="w-full" onClick={share}>
      <Share2 size={16} /> Share to get more supporters
    </Button>
  );
}

/* ───────────────────────── Trial check-in ───────────────────────── */

export function CheckInCard({ proposalId, checkedIn, live }: { proposalId: string; checkedIn: boolean; live: boolean }) {
  const router = useRouter();
  const [rating, setRating] = useState<1 | 2 | 3 | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (!live) return null;
  const submit = () =>
    rating &&
    start(async () => {
      const r = await checkIn({ proposalId, rating, note });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Logged. That's a data point for the decision.");
      setRating(null);
      setNote("");
      router.refresh();
    });
  return (
    <div className="card border-brand p-5">
      <div className="flex items-center gap-2 font-semibold text-brand">
        <FlaskConical size={18} /> Trial is running — did you use it today?
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {checkedIn ? "You've checked in today. Submit again to change your answer." : "One check-in a day. This is the evidence that decides whether it stays."}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([3, 2, 1] as const).map((k) => (
          <button
            key={k}
            onClick={() => setRating(k)}
            aria-pressed={rating === k}
            className={cn(
              "rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors",
              rating === k
                ? k === 3
                  ? "border-ok bg-ok-soft text-ok"
                  : k === 2
                    ? "border-warn bg-warn-soft text-warn"
                    : "border-danger bg-danger-soft text-danger"
                : "border-transparent bg-surface-2 hover:bg-surface-3",
            )}
          >
            {TRIAL_RATINGS[k].label}
          </button>
        ))}
      </div>
      {rating && (
        <div className="mt-3 flex gap-2 animate-rise">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} placeholder="Anything to add? (optional)" className={cn(inputClass, "h-10 text-sm")} />
          <Button onClick={submit} disabled={pending}>
            Check in
          </Button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Posts ───────────────────────── */

export function PostComposer({ proposalId, canUpdate, updateLabel }: { proposalId: string; canUpdate: boolean; updateLabel: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [asUpdate, setAsUpdate] = useState(false);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await postOnProposal({ proposalId, body, asUpdate });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.pending) toast.success("Sent for approval. It shows here once a moderator approves it.");
      setBody("");
      setAsUpdate(false);
      router.refresh();
    });
  return (
    <div className="card p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        rows={3}
        placeholder={asUpdate ? "What happened? Who did you meet, what did they say, what's next?" : "Add to the discussion — concerns and counter-points count as evidence too."}
        className={cn(inputClass, "resize-y py-3 leading-relaxed")}
        aria-label="Write a post"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {canUpdate ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={asUpdate} onChange={(e) => setAsUpdate(e.target.checked)} />
            <Megaphone size={15} className="text-brand" /> {updateLabel} <span className="text-ink-muted">· notifies supporters</span>
          </label>
        ) : (
          <span className="text-xs text-ink-muted">Posted under your name. Keep it about the idea.</span>
        )}
        <Button onClick={submit} disabled={pending || body.trim().length < 2}>
          <Send size={15} /> Post
        </Button>
      </div>
    </div>
  );
}

export function HidePostButton({ postId, hidden }: { postId: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setPostHidden(postId, !hidden);
          if (!r.ok) toast.error(r.error);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-danger"
    >
      <EyeOff size={11} /> {hidden ? "Restore" : "Hide"}
    </button>
  );
}

/* ───────────────────────── Moving it forward ───────────────────────── */

const MOVE_COPY: Record<Stage, { button: string; title: string; placeholder: string }> = {
  in_review: {
    button: "Take it to the office",
    title: "Record that this has gone to the office",
    placeholder: "Who did you take it to, and when? e.g. “Met the Student Life Office on 19 Nov with the evidence pack. They'll respond by Friday.”",
  },
  trial: { button: "Start a trial run", title: "Start a trial run", placeholder: "What was agreed? Any conditions for the trial." },
  adopted: { button: "Mark adopted", title: "This is now permanent", placeholder: "What was approved, and from when." },
  declined: { button: "Mark not approved", title: "Record the decision", placeholder: "The reason, in public. People backed this — they deserve to know why." },
  withdrawn: { button: "Withdraw", title: "Withdraw this proposal", placeholder: "Why is this being withdrawn?" },
  gathering: { button: "Back to gathering interest", title: "Reopen for more support", placeholder: "Why is this going back? (optional)" },
};

export function MovePanel({
  proposalId,
  stage,
  canDecide,
  isAdmin,
  hidden,
  departmentId,
  departments,
  trialPlan,
  isAuthor,
}: {
  proposalId: string;
  stage: Stage;
  canDecide: boolean;
  isAuthor: boolean;
  isAdmin: boolean;
  hidden: boolean;
  departmentId: string | null;
  departments: { id: string; name: string }[];
  trialPlan: string | null;
}) {
  const router = useRouter();
  const moves = canDecide ? STAGE_MOVES[stage] : isAuthor ? (AUTHOR_MOVES[stage] ?? []) : [];
  const [to, setTo] = useState<Stage | null>(null);
  const [note, setNote] = useState("");
  const [dept, setDept] = useState(departmentId ?? "");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [plan, setPlan] = useState(trialPlan ?? "");
  const [pending, start] = useTransition();
  if (!moves.length && !isAdmin) return null;

  const submit = () =>
    to &&
    start(async () => {
      const r = await moveProposal({ proposalId, to, note, departmentId: dept, trialStartsOn: starts, trialEndsOn: ends, trialPlan: plan });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Moved to “${STAGE_META[to].label}”. Supporters have been notified.`);
      setTo(null);
      setNote("");
      router.refresh();
    });

  return (
    <div className="card p-4">
      <div className="text-[13px] text-ink-muted">{canDecide ? "Office controls" : "Move it forward"}</div>
      {!to && (
        <div className="mt-3 flex flex-col gap-2">
          {moves.map((m) => (
            <Button key={m} variant={m === "declined" || m === "withdrawn" ? "ghost" : "secondary"} size="sm" className="justify-start" onClick={() => setTo(m)}>
              {m === "trial" ? <FlaskConical size={14} /> : m === "adopted" ? <Check size={14} /> : m === "in_review" ? <HandHeart size={14} /> : null}
              {MOVE_COPY[m].button}
            </Button>
          ))}
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setProposalHidden(proposalId, !hidden);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
            >
              <EyeOff size={14} /> {hidden ? "Restore to the list" : "Hide from the list"}
            </Button>
          )}
        </div>
      )}
      {to && (
        <div className="mt-3 space-y-3 animate-rise">
          <div className="text-sm font-semibold">{MOVE_COPY[to].title}</div>
          {(to === "in_review" || to === "trial") && (
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={cn(inputClass, "h-10 text-sm")} aria-label="Owning office">
              <option value="">Which office owns this?</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {to === "trial" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-ink-muted">
                  Starts
                  <input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className={cn(inputClass, "mt-1 h-10 px-3 text-sm")} />
                </label>
                <label className="text-xs text-ink-muted">
                  Ends
                  <input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} className={cn(inputClass, "mt-1 h-10 px-3 text-sm")} />
                </label>
              </div>
              <textarea value={plan} onChange={(e) => setPlan(e.target.value.slice(0, 1000))} rows={2} placeholder="What the trial looks like" className={cn(inputClass, "resize-none py-2.5 text-sm")} />
            </>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={3} placeholder={MOVE_COPY[to].placeholder} className={cn(inputClass, "resize-none py-2.5 text-sm leading-relaxed")} />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={pending} className="flex-1">
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTo(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
          <p className="text-[11px] text-ink-muted">This goes on the public timeline permanently.</p>
        </div>
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      Print or save as PDF
    </Button>
  );
}
