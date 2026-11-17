"use client";

import { forceCollide, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from "d3-force";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardIssue } from "@/server/queries";
import { STATUS_META } from "@/lib/constants";

type Cat = { id: string; name: string; color: string };

type Node = SimulationNodeDatum & {
  id: string;
  issue: BoardIssue;
  r: number; // drawn radius (tweened)
  tr: number; // target radius
  pulse: number; // 0..1, set when me-too count grows
  pop: number; // 0..1 entry animation
};

const TAU = Math.PI * 2;

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxW) line = test;
    else {
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1]!;
    while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/[\s,.;:]+$/, "") + "…";
  }
  return lines;
}

export function BubbleField({
  issues,
  categories,
  groupBy = "none",
  height = 560,
}: {
  issues: BoardIssue[];
  categories: Cat[];
  groupBy?: "none" | "category";
  height?: number;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const simRef = useRef<Simulation<Node, undefined> | null>(null);
  const sizeRef = useRef({ w: 800, h: height });
  const hoverRef = useRef<Node | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; w: number; node: Node } | null>(null);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const maxHeat = useMemo(() => Math.max(1, ...issues.map((i) => i.heat)), [issues]);
  const drawRef = useRef<() => void>(() => {});
  const reduced = useRef(false);

  /* ── layout targets ── */
  const computeRadii = (list: BoardIssue[], w: number, h: number) => {
    const total = list.reduce((s, i) => s + Math.max(1, i.metooCount), 0) || 1;
    const fill = list.length < 12 ? 0.3 : 0.42;
    const scale = Math.sqrt((fill * w * h) / (Math.PI * total));
    const rMin = w < 520 ? 16 : 20;
    const rMax = Math.min(w, h) * 0.2;
    return (m: number) => Math.min(rMax, Math.max(rMin, scale * Math.sqrt(Math.max(1, m))));
  };

  const clusterCenter = (catId: string, w: number, h: number) => {
    if (groupBy !== "category") return { x: w / 2, y: h / 2 };
    const ids = categories.map((c) => c.id);
    const idx = Math.max(0, ids.indexOf(catId));
    const cols = w < 640 ? 2 : Math.min(4, Math.ceil(Math.sqrt(ids.length * (w / h))));
    const rows = Math.ceil(ids.length / cols);
    const cx = ((idx % cols) + 0.5) * (w / cols);
    const cy = (Math.floor(idx / cols) + 0.5) * (h / rows);
    return { x: cx, y: cy };
  };

  /* ── sync data → nodes ── */
  useEffect(() => {
    const { w, h } = sizeRef.current;
    const radius = computeRadii(issues, w, h);
    const map = nodesRef.current;
    const seen = new Set<string>();
    for (const issue of issues) {
      seen.add(issue.id);
      const existing = map.get(issue.id);
      const tr = radius(issue.metooCount);
      if (existing) {
        if (issue.metooCount > existing.issue.metooCount) existing.pulse = 1;
        existing.issue = issue;
        existing.tr = tr;
      } else {
        const c = clusterCenter(issue.categoryId, w, h);
        const a = Math.random() * TAU;
        const d = 40 + Math.random() * Math.min(w, h) * 0.3;
        map.set(issue.id, {
          id: issue.id,
          issue,
          r: map.size ? 0 : tr,
          tr,
          pulse: 0,
          pop: map.size ? 0 : 1,
          x: c.x + Math.cos(a) * d,
          y: c.y + Math.sin(a) * d,
        });
      }
    }
    for (const id of [...map.keys()]) if (!seen.has(id)) map.delete(id);

    const nodes = [...map.values()];
    let sim = simRef.current;
    if (!sim) {
      sim = forceSimulation<Node>(nodes).velocityDecay(0.32).alphaDecay(0.018);
      simRef.current = sim;
    } else sim.nodes(nodes);

    sim
      .force("x", forceX<Node>((n) => clusterCenter(n.issue.categoryId, sizeRef.current.w, sizeRef.current.h).x).strength(groupBy === "category" ? 0.09 : 0.045))
      .force("y", forceY<Node>((n) => clusterCenter(n.issue.categoryId, sizeRef.current.w, sizeRef.current.h).y).strength(groupBy === "category" ? 0.09 : 0.06))
      .force("collide", forceCollide<Node>((n) => n.tr + 3).strength(0.85).iterations(2))
      .force("bounds", () => {
        // keep every bubble fully inside the frame
        const { w, h } = sizeRef.current;
        for (const n of sim!.nodes()) {
          const r = n.tr + 4;
          if (n.x != null) n.x = Math.max(r, Math.min(w - r, n.x));
          if (n.y != null) n.y = Math.max(r, Math.min(h - r, n.y));
        }
      });

    if (reduced.current) {
      nodes.forEach((n) => ((n.r = n.tr), (n.pop = 1), (n.pulse = 0)));
      sim.stop();
      for (let i = 0; i < 260; i++) sim.tick();
      drawRef.current();
    } else {
      sim.alpha(Math.max(sim.alpha(), 0.35)).restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, groupBy]);

  /* ── canvas lifecycle ── */
  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let running = true;

    const resize = () => {
      const el = wrapRef.current!;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      const radius = computeRadii(
        [...nodesRef.current.values()].map((n) => n.issue),
        w,
        h,
      );
      nodesRef.current.forEach((n) => (n.tr = radius(n.issue.metooCount)));
      simRef.current?.alpha(0.4).restart();
      if (reduced.current) {
        nodesRef.current.forEach((n) => (n.r = n.tr));
        simRef.current?.stop();
        for (let i = 0; i < 200; i++) simRef.current?.tick();
        draw();
      }
    };

    const draw = () => {
      const { w, h } = sizeRef.current;
      const css = getComputedStyle(canvas);
      const ink = css.getPropertyValue("--ink").trim() || "#111";
      const muted = css.getPropertyValue("--ink-muted").trim() || "#666";
      const surface = css.getPropertyValue("--surface").trim() || "#fff";
      const ok = css.getPropertyValue("--ok").trim() || "#1f9d55";
      const sans = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
      const display = css.getPropertyValue("--font-outfit").trim() || sans;
      const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      ctx.clearRect(0, 0, w, h);

      const nodes = [...nodesRef.current.values()].sort((a, b) => a.r - b.r);
      const hover = hoverRef.current;

      if (groupBy === "category") {
        ctx.font = `600 11px ${sans}`;
        ctx.textAlign = "center";
        ctx.fillStyle = muted;
        for (const c of categories) {
          if (!nodes.some((n) => n.issue.categoryId === c.id)) continue;
          const p = clusterCenter(c.id, w, h);
          const below = nodes.filter((n) => n.issue.categoryId === c.id).reduce((m, n) => Math.max(m, (n.y ?? 0) + n.r), p.y);
          ctx.fillText(c.name.toUpperCase(), p.x, Math.min(h - 8, below + 16));
        }
      }

      for (const n of nodes) {
        if (n.r < 0.5) continue;
        const x = n.x ?? 0;
        const y = n.y ?? 0;
        const cat = catMap.get(n.issue.categoryId);
        const color = cat?.color ?? "#888";
        const heat = Math.min(1, n.issue.heat / maxHeat);
        const resolved = n.issue.status === "resolved";
        const isHover = hover?.id === n.id;
        const r = n.r * (isHover ? 1.04 : 1) * (0.6 + 0.4 * easeOut(n.pop));

        // heat glow
        if (heat > 0.35 && !resolved) {
          ctx.save();
          ctx.shadowColor = rgba(color, dark ? 0.55 : 0.45);
          ctx.shadowBlur = 8 + heat * 26;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fillStyle = rgba(color, 0.01);
          ctx.fill();
          ctx.restore();
        }

        // body: tinted fill, intensity follows heat
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        const base = resolved ? 0.1 : 0.16 + heat * 0.3;
        g.addColorStop(0, rgba(color, base * (dark ? 1.5 : 0.75)));
        g.addColorStop(1, rgba(color, base * (dark ? 2.2 : 1.35)));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = surface;
        ctx.fill();
        ctx.fillStyle = g;
        ctx.fill();

        // ring = status
        ctx.lineWidth = isHover ? 2.5 : 1.6;
        ctx.strokeStyle = resolved ? ok : rgba(color, 0.95);
        if (n.issue.status === "open") ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (n.issue.status === "in_progress") {
          ctx.beginPath();
          ctx.arc(x, y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * 0.66);
          ctx.strokeStyle = rgba(color, 0.7);
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.lineCap = "butt";
        }

        // pulse ring when someone just added a me-too
        if (n.pulse > 0) {
          ctx.beginPath();
          ctx.arc(x, y, r + (1 - n.pulse) * 26, 0, TAU);
          ctx.strokeStyle = rgba(color, n.pulse * 0.8);
          ctx.lineWidth = 3 * n.pulse;
          ctx.stroke();
        }

        // resolved badge
        if (resolved && r > 16) {
          const bx = x + r * 0.7;
          const by = y - r * 0.7;
          ctx.beginPath();
          ctx.arc(bx, by, 8, 0, TAU);
          ctx.fillStyle = ok;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(bx - 3.5, by);
          ctx.lineTo(bx - 1, by + 2.6);
          ctx.lineTo(bx + 3.8, by - 2.6);
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }

        // labels
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const count = String(n.issue.metooCount);
        if (r >= 44) {
          const fs = Math.min(15, Math.max(11, r / 5.2));
          ctx.font = `600 ${fs}px ${sans}`;
          const lines = wrap(ctx, n.issue.title, r * 1.45, r > 80 ? 3 : 2);
          const countFs = Math.min(34, r / 2.6);
          const blockH = countFs + 4 + lines.length * (fs + 2);
          let yy = y - blockH / 2 + countFs / 2;
          ctx.font = `600 ${countFs}px ${display}`;
          ctx.fillStyle = dark ? "#fff" : ink;
          ctx.fillText(count, x, yy);
          yy += countFs / 2 + 6 + fs / 2;
          ctx.font = `500 ${fs}px ${sans}`;
          ctx.fillStyle = dark ? "rgba(255,255,255,.86)" : ink;
          for (const l of lines) {
            ctx.fillText(l, x, yy);
            yy += fs + 2;
          }
        } else if (r >= 15) {
          ctx.font = `600 ${Math.max(11, r / 1.9)}px ${display}`;
          ctx.fillStyle = dark ? "#fff" : ink;
          ctx.fillText(count, x, y + 0.5);
        }
      }
    };
    drawRef.current = draw;

    const loop = () => {
      if (!running) return;
      let animating = false;
      nodesRef.current.forEach((n) => {
        if (Math.abs(n.r - n.tr) > 0.2) {
          n.r += (n.tr - n.r) * 0.12;
          animating = true;
        } else n.r = n.tr;
        if (n.pop < 1) {
          n.pop = Math.min(1, n.pop + 0.04);
          animating = true;
        }
        if (n.pulse > 0) {
          n.pulse = Math.max(0, n.pulse - 0.016);
          animating = true;
        }
      });
      const sim = simRef.current;
      if (sim && sim.alpha() > sim.alphaMin()) animating = true;
      if (animating || hoverRef.current) draw();
      raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrapRef.current!);
    resize();
    simRef.current?.on("tick", () => {}); // we draw from rAF, not ticks
    if (!reduced.current) raf = requestAnimationFrame(loop);
    else draw();

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
        simRef.current?.stop();
      } else if (!reduced.current) {
        running = true;
        simRef.current?.restart();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      mq.removeEventListener("change", draw);
      mo.disconnect();
      simRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, catMap, maxHeat]);

  /* ── pointer: hover, click, drag ── */
  const hit = (px: number, py: number) => {
    let best: Node | null = null;
    nodesRef.current.forEach((n) => {
      const dx = px - (n.x ?? 0);
      const dy = py - (n.y ?? 0);
      if (dx * dx + dy * dy <= n.r * n.r && (!best || n.r < best.r)) best = n;
    });
    return best as Node | null;
  };
  const drag = useRef<{ node: Node; sx: number; sy: number; moved: boolean } | null>(null);

  const local = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (drag.current) {
      const d = drag.current;
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 5) d.moved = true;
      d.node.fx = p.x;
      d.node.fy = p.y;
      simRef.current?.alphaTarget(0.25).restart();
      setTip(null);
      return;
    }
    const n = hit(p.x, p.y);
    hoverRef.current = n;
    canvasRef.current!.style.cursor = n ? "pointer" : "default";
    setTip(n ? { x: p.x, y: p.y, w: sizeRef.current.w, node: n } : null);
    if (reduced.current) drawRef.current();
  };
  const onDown = (e: React.PointerEvent) => {
    const p = local(e);
    const n = hit(p.x, p.y);
    if (!n) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { node: n, sx: p.x, sy: p.y, moved: false };
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.node.fx = null;
    d.node.fy = null;
    simRef.current?.alphaTarget(0);
    if (!d.moved) router.push(`/issues/${d.node.issue.number}`);
  };

  return (
    <div ref={wrapRef} className="relative h-[440px] w-full select-none sm:h-[var(--bubble-h)]" style={{ "--bubble-h": `${height}px` } as React.CSSProperties}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        role="img"
        aria-label={`${issues.length} issues shown as bubbles; bigger bubbles have more people affected.`}
        onPointerMove={onMove}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={() => {
          hoverRef.current = null;
          setTip(null);
        }}
      />
      {/* Screen-reader & keyboard equivalent of the canvas */}
      <ul className="sr-only">
        {issues.map((i) => (
          <li key={i.id}>
            <a href={`/issues/${i.number}`}>
              #{i.number} {i.title} — {i.metooCount} affected, {STATUS_META[i.status].label}
            </a>
          </li>
        ))}
      </ul>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] rounded-xl border border-line bg-surface/95 px-3 py-2 text-sm shadow-lg backdrop-blur"
          style={{
            left: Math.max(8, Math.min(tip.x + 14, tip.w - 290)),
            top: Math.max(8, tip.y - 70),
          }}
        >
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <span className="inline-block size-2 rounded-full" style={{ background: catMap.get(tip.node.issue.categoryId)?.color }} />
            {catMap.get(tip.node.issue.categoryId)?.name} · #{tip.node.issue.number}
          </div>
          <div className="mt-0.5 font-medium leading-snug text-ink">{tip.node.issue.title}</div>
          <div className="mt-1 text-xs text-ink-muted">
            <b className="text-ink">{tip.node.issue.metooCount}</b> affected · {STATUS_META[tip.node.issue.status].label}
          </div>
        </div>
      )}
    </div>
  );
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
