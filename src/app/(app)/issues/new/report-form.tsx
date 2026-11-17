"use client";

import { ArrowRight, Camera, Check, EyeOff, Hand, Info, Loader2, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, CategoryIcon, StatusPill } from "@/components/ui";
import { MAX_PHOTOS, SEVERITY_META, type SeverityKey, type Status } from "@/lib/constants";
import { cn } from "@/lib/format";
import { createIssue, toggleMetoo } from "@/server/actions/issues";

type Cat = { id: string; name: string; icon: string; color: string; slaHours: number; departmentId: string };
type Loc = { id: string; name: string; zone: string };
type Similar = { id: string; number: number; title: string; status: Status; metooCount: number; viewerVoted: boolean; categoryId: string };

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

export function ReportForm({ categories, locations, departments }: { categories: Cat[]; locations: Loc[]; departments: Record<string, string> }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string>("");
  const [locationId, setLocationId] = useState("");
  const [locationDetail, setLocationDetail] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<SeverityKey>("medium");
  const [anonymous, setAnonymous] = useState(false);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [searching, setSearching] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const cat = categories.find((c) => c.id === categoryId);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  useEffect(() => {
    const q = title.trim();
    if (q.length < 5) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const p = new URLSearchParams({ q });
        if (categoryId) p.set("category", categoryId);
        if (locationId) p.set("location", locationId);
        const r = await fetch(`/api/issues/similar?${p}`, { signal: ctrl.signal });
        if (r.ok) {
          setSimilar((await r.json()).results);
          setDismissed(false);
        }
      } catch {
        /* aborted */
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [title, categoryId, locationId]);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = [...files].slice(0, room);
    if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos`);
    const done = await Promise.all(picked.map(compress));
    setPhotos((p) => [...p, ...done.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const metoo = (s: Similar) =>
    start(async () => {
      if (!s.viewerVoted) {
        const r = await toggleMetoo(s.id);
        if (!r.ok) return void toast.error(r.error);
        toast.success(`You're person #${r.metooCount} on this one. We'll keep you posted.`);
      }
      router.push(`/issues/${s.number}`);
    });

  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("body", body);
      fd.set("categoryId", categoryId);
      fd.set("locationId", locationId);
      fd.set("locationDetail", locationDetail);
      fd.set("severity", severity);
      fd.set("anonymous", String(anonymous));
      photos.forEach((p) => fd.append("photos", p.file));
      const r = await createIssue(fd);
      if (!r.ok) return void toast.error(r.error);
      router.push(`/issues/${r.number}?new=1`);
    });

  const ready = !!categoryId && title.trim().length >= 8;
  const showSimilar = title.trim().length >= 5 && similar.length > 0 && !dismissed;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {/* 1 · Category */}
        <section className="card p-5 sm:p-6">
          <StepLabel n={1} done={!!categoryId}>
            What kind of issue?
          </StepLabel>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                aria-pressed={categoryId === c.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-sm font-medium transition-all",
                  categoryId === c.id ? "border-transparent ring-2" : "border-transparent bg-surface-2 hover:bg-surface-3",
                )}
                style={categoryId === c.id ? ({ "--tw-ring-color": c.color, background: `color-mix(in srgb, ${c.color} 9%, var(--surface))` } as React.CSSProperties) : undefined}
              >
                <CategoryIcon icon={c.icon} color={c.color} size={16} boxed />
                <span className="leading-tight">{c.name}</span>
              </button>
            ))}
          </div>
          {cat && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted animate-rise">
              <Info size={13} /> Goes to <b className="text-ink">{departments[cat.departmentId]}</b> · target fix time{" "}
              <b className="text-ink">{cat.slaHours < 48 ? `${cat.slaHours} hours` : `${Math.round(cat.slaHours / 24)} days`}</b>
            </p>
          )}
        </section>

        {/* 2 · Where */}
        <section className="card p-5 sm:p-6">
          <StepLabel n={2} done={!!locationId}>
            Where is it?
          </StepLabel>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <MapPin size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl bg-surface-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
                aria-label="Location"
              >
                <option value="">Pick a place…</option>
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
            </div>
            <input
              value={locationDetail}
              onChange={(e) => setLocationDetail(e.target.value.slice(0, 80))}
              placeholder="Room / floor (optional)"
              className="h-11 rounded-xl bg-surface-2 px-3.5 text-sm outline-none transition-colors placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
            />
          </div>
        </section>

        {/* 3 · Describe */}
        <section className="card p-5 sm:p-6">
          <StepLabel n={3} done={title.trim().length >= 8}>
            Describe it
          </StepLabel>
          <div className="mt-4 space-y-3">
            <div className="relative">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder="e.g. Wi-Fi drops every night on floor 8"
                className="h-12 w-full rounded-xl bg-surface-2 px-4 pr-10 text-[16px] font-medium outline-none transition-colors placeholder:font-normal placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
                aria-label="Title"
              />
              {searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-ink-muted" />}
            </div>

            {showSimilar && (
              <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-accent-soft animate-rise">
                <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                  <div>
                    <div className="text-sm font-semibold text-accent-ink">Is it one of these?</div>
                    <div className="text-xs text-ink-2">Adding a me-too makes the existing issue bigger — that gets things fixed faster than a new report.</div>
                  </div>
                  <button onClick={() => setDismissed(true)} className="text-ink-muted hover:text-ink" aria-label="Dismiss suggestions">
                    <X size={16} />
                  </button>
                </div>
                <ul className="mt-2 divide-y divide-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
                  {similar.map((s) => {
                    const c = catMap.get(s.categoryId);
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                        {c && <CategoryIcon icon={c.icon} color={c.color} size={14} boxed />}
                        <Link href={`/issues/${s.number}`} target="_blank" className="min-w-0 flex-1">
                          <span className="line-clamp-1 text-sm font-medium hover:underline">{s.title}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                            #{s.number} · <b className="text-ink">{s.metooCount}</b> affected <StatusPill status={s.status} short />
                          </span>
                        </Link>
                        <Button size="sm" onClick={() => metoo(s)} disabled={pending}>
                          <Hand size={14} /> {s.viewerVoted ? "Open" : "Me too"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <button onClick={() => setDismissed(true)} className="w-full border-t border-[color-mix(in_srgb,var(--accent)_35%,transparent)] px-4 py-2 text-left text-xs font-semibold text-ink-2 hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]">
                  None of these — mine is different →
                </button>
              </div>
            )}

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 4000))}
              rows={5}
              placeholder="What's happening, since when, and how it affects you. Stick to the issue — don't name individuals."
              className="w-full resize-y rounded-xl bg-surface-2 px-4 py-3 text-[15px] outline-none transition-colors placeholder:text-ink-muted focus:bg-surface focus:ring-2 focus:ring-brand"
              aria-label="Description"
            />

            <div>
              <div className="mb-2 text-sm font-medium">How bad is it?</div>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(SEVERITY_META) as SeverityKey[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSeverity(k)}
                    aria-pressed={severity === k}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      severity === k
                        ? k === "high"
                          ? "border-transparent bg-danger text-white"
                          : "border-transparent bg-ink text-bg"
                        : "border-transparent bg-surface-2 hover:bg-surface-3",
                    )}
                  >
                    {SEVERITY_META[k].label}
                  </button>
                ))}
              </div>
            </div>

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
              <p className="mt-1.5 text-[11px] text-ink-muted">Location data is stripped from photos automatically.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Summary / submit */}
      <aside className="lg:sticky lg:top-24 lg:h-fit">
        <div className="card p-5">
          <div className="text-[13px] text-ink-muted">Your report</div>
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Category" value={cat?.name} />
            <Row label="Where" value={[locations.find((l) => l.id === locationId)?.name, locationDetail].filter(Boolean).join(" · ") || undefined} />
            <Row label="Routed to" value={cat ? departments[cat.departmentId] : undefined} />
            <Row label="Severity" value={SEVERITY_META[severity].label} />
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="peer sr-only" />
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                anonymous ? "bg-mint" : "bg-line-strong",
              )}
            >
              <span className={cn("size-4 rounded-full bg-white shadow transition-transform", anonymous && "translate-x-4")} />
            </span>
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <EyeOff size={14} /> Post anonymously
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">Students and staff won&apos;t see your name. Campus admins can, to prevent abuse.</span>
            </span>
          </label>

          <Button size="lg" className="mt-5 w-full" disabled={!ready || pending} onClick={submit}>
            {pending ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Post to the board
          </Button>
          {!ready && <p className="mt-2 text-center text-xs text-ink-muted">Pick a category and write a title (8+ characters).</p>}
          <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
            Your report is visible to everyone at Plaksha. You&apos;ll be notified on every update and asked to confirm the fix.
          </p>
        </div>
      </aside>
    </div>
  );
}

function StepLabel({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors",
          done ? "bg-mint text-brand-ink" : "bg-surface-2 text-ink-muted ring-1 ring-line-strong",
        )}
      >
        {done ? <Check size={13} strokeWidth={3} /> : n}
      </span>
      <h2 className="font-semibold">{children}</h2>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className={cn("text-right font-medium", !value && "text-ink-muted/60")}>{value ?? "—"}</span>
    </div>
  );
}
