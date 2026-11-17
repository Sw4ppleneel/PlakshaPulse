"use client";

import { ArrowRight, Camera, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { inputClass } from "@/components/proposal-ui";
import { Button } from "@/components/ui";
import { AREAS, COHORTS, DEFAULT_GOAL, MAX_PHOTOS } from "@/lib/constants";
import { cn } from "@/lib/format";
import { createProposal } from "@/server/actions/proposals";

/** Downscale on-device so uploads are small; the server still re-encodes and strips metadata. */
async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const GOALS = [25, 50, 100, 200];

export function ProposeForm({ departments, cohort }: { departments: { id: string; name: string }[]; cohort: string | null }) {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [title, setTitle] = useState("");
  const [ask, setAsk] = useState("");
  const [body, setBody] = useState("");
  const [trialPlan, setTrialPlan] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [group, setGroup] = useState(cohort ?? "");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhotos = async (list: FileList | null) => {
    if (!list) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = await Promise.all([...list].slice(0, room).map(compress));
    setPhotos((ps) => [...ps, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const ready = area && title.trim().length >= 8 && ask.trim().length >= 15 && (cohort || group);

  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("area", area);
      fd.set("title", title);
      fd.set("ask", ask);
      fd.set("body", body);
      fd.set("trialPlan", trialPlan);
      fd.set("departmentId", departmentId);
      fd.set("goal", String(goal));
      fd.set("cohort", group);
      photos.forEach((p) => fd.append("photos", p.file));
      const r = await createProposal(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.pending ? "Sent for approval" : "It's live. Share the link to start collecting support.", r.pending ? { description: "A moderator will look at it shortly. You'll get an update either way." } : undefined);
      router.push(`/proposals/${r.number}`);
    });

  return (
    <div className="space-y-4">
      <section className="card p-5 sm:p-6">
        <Step n={1} done={!!area}>
          What kind of change is it?
        </Step>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AREAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setArea(a.id)}
              aria-pressed={area === a.id}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                area === a.id ? "border-transparent bg-ink text-bg" : "border-transparent bg-surface-2 hover:bg-surface-3",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        {area && AREAS.find((a) => a.id === area)?.hint && <p className="mt-2 text-xs text-ink-muted">{AREAS.find((a) => a.id === area)!.hint}</p>}
      </section>

      <section className="card p-5 sm:p-6">
        <Step n={2} done={title.trim().length >= 8 && ask.trim().length >= 15}>
          What are you asking for?
        </Step>
        <div className="mt-4 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 100))}
            placeholder="A short title, e.g. Keep the makerspace open till midnight"
            className={cn(inputClass, "h-12 font-medium placeholder:font-normal")}
            aria-label="Title"
          />
          <div>
            <textarea
              value={ask}
              onChange={(e) => setAsk(e.target.value.slice(0, 280))}
              rows={2}
              placeholder="The ask, in one sentence. Who should do what? e.g. “Extend makerspace hours from 9pm to midnight on weekdays, with a student supervisor on duty.”"
              className={cn(inputClass, "resize-none py-3 leading-relaxed")}
              aria-label="The ask"
            />
            <div className="mt-1 text-right text-[11px] text-ink-muted tabular">{ask.length}/280</div>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 5000))}
            rows={5}
            placeholder="Why it matters, who benefits, what it would cost or need, and anything you've already found out. (optional, but it's what convinces people)"
            className={cn(inputClass, "resize-y py-3 leading-relaxed")}
            aria-label="Details"
          />
          <div>
            <div className="mb-2 text-sm font-medium">
              Photos <span className="font-normal text-ink-muted">(optional, up to {MAX_PHOTOS})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={p.url} className="relative size-20 overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="size-full object-cover" />
                  <button
                    onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                    aria-label="Remove photo"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex size-20 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 text-xs text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <Camera size={18} /> Add
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <Step n={3} done={true}>
          How should it be tested and decided?
        </Step>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="trial" className="text-sm font-medium">
              How could a trial work? <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <textarea
              id="trial"
              value={trialPlan}
              onChange={(e) => setTrialPlan(e.target.value.slice(0, 1000))}
              rows={2}
              placeholder="e.g. Two weeks, weekdays only, with a sign-in sheet. Offices say yes to trials far more easily than to permanent changes."
              className={cn(inputClass, "mt-2 resize-none py-3 text-sm leading-relaxed")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="office" className="text-sm font-medium">
                Which office decides? <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <select id="office" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={cn(inputClass, "mt-2 h-11 text-sm")}>
                <option value="">Not sure yet</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm font-medium">How many supporters is enough?</div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {GOALS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(g)}
                    aria-pressed={goal === g}
                    className={cn("h-11 rounded-xl border text-sm font-semibold tabular transition-colors", goal === g ? "border-transparent bg-ink text-bg" : "border-transparent bg-surface-2 hover:bg-surface-3")}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {!cohort && (
            <div>
              <label htmlFor="cohort" className="text-sm font-medium">
                Your batch or group
              </label>
              <select id="cohort" value={group} onChange={(e) => setGroup(e.target.value)} className={cn(inputClass, "mt-2 h-11 text-sm")}>
                <option value="">Choose…</option>
                {COHORTS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-xs text-ink-muted">Posted under your name — proposals need an owner to carry them. You&apos;re counted as the first supporter.</p>
        <Button size="lg" onClick={submit} disabled={!ready || pending}>
          {pending ? "Posting…" : "Post proposal"} <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );
}

function Step({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular", done ? "bg-mint text-brand-ink" : "bg-surface-2 text-ink-muted")}>
        {done ? <Check size={15} strokeWidth={3} /> : n}
      </span>
      <h2 className="font-semibold">{children}</h2>
    </div>
  );
}
