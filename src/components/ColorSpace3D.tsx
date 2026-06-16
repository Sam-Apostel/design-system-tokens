import { useEffect, useMemo, useRef, useState } from "react";
import { rgbToOklab, rgbToLab, rgbToHsl, type RGB, type ColorSpace } from "../lib/color";
import type { Token } from "../types";

/**
 * A real 3D scatter of the color tokens — each color is a point in the chosen
 * space (OKLab/CIELAB cartesian, or HSL as a cylinder), not a 2D projection of
 * one. Orbit by dragging, zoom by scrolling, click a dot to edit it. Dots,
 * ramp links, the wire cage and drop lines are all depth-sorted so near objects
 * correctly occlude far ones, and a perspective foreshortening + depth fade sell
 * the third dimension. Hand-rolled (no 3D lib) to match the SVG plots.
 */

export interface Item3D {
  token: Token;
  rgb: RGB;
  css: string;
  hex: string;
  ramp: string;
}

const S = 560;
const C = S / 2;
const FOCAL = 3.7; // camera focal length (perspective strength)

/** Raw coordinates for a color in the chosen space (before fitting). */
function worldRaw(rgb: RGB, space: ColorSpace): { x: number; y: number; z: number } {
  if (space === "oklab") {
    const o = rgbToOklab(rgb);
    return { x: o.a, y: o.b, z: o.L }; // a/b plane, L up
  }
  if (space === "cielab") {
    const o = rgbToLab(rgb);
    return { x: o.a / 128, y: o.b / 128, z: o.L / 100 };
  }
  const o = rgbToHsl(rgb); // HSL cylinder: hue angle, sat radius, lightness up
  const hr = (o.h * Math.PI) / 180;
  return { x: o.s * Math.cos(hr), y: o.s * Math.sin(hr), z: o.l };
}

interface Vec3 { x: number; y: number; z: number }
interface Proj { sx: number; sy: number; depth: number; scale: number }

/** Rotate by yaw (about vertical) then pitch (camera tilt), then project. */
function project(p: Vec3, yaw: number, pitch: number, zoom: number): Proj {
  const cz = Math.cos(yaw), sz = Math.sin(yaw);
  const x1 = p.x * cz - p.y * sz;
  const y1 = p.x * sz + p.y * cz;
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const y2 = y1 * cx - p.z * sx;
  const z2 = y1 * sx + p.z * cx;
  const depth = y2; // +depth = toward the camera
  const scale = FOCAL / (FOCAL - depth);
  const R = S * 0.3 * zoom;
  return { sx: C + x1 * R * scale, sy: C - z2 * R * scale, depth, scale };
}

type Prim =
  | { kind: "cage"; depth: number; a: Proj; b: Proj; w: number; o: number }
  | { kind: "ring"; depth: number; a: Proj; b: Proj; color: string }
  | { kind: "drop"; depth: number; a: Proj; b: Proj; color: string; dim: boolean }
  | { kind: "link"; depth: number; a: Proj; b: Proj; emph: boolean; dim: boolean }
  | { kind: "dot"; depth: number; p: Proj; it: Item3D; flagged: boolean; dim: boolean; emph: boolean };

export function ColorSpace3D({
  items,
  space,
  showLinks,
  emphasize,
  onHoverRamp,
  flagged,
  onPick,
}: {
  items: Item3D[];
  space: ColorSpace;
  showLinks: boolean;
  emphasize?: string | null;
  onHoverRamp?: (ramp: string | null) => void;
  flagged?: Set<string>;
  onPick?: (name: string) => void;
}) {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [yaw, setYaw] = useState(-0.6);
  const [pitch, setPitch] = useState(-0.5);
  const [zoom, setZoom] = useState(1);
  const [autoRotate, setAutoRotate] = useState(!reduceMotion);
  const [drops, setDrops] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Fit the data into a unit-ish box: uniform horizontal scale (so hue angles
  // stay true) and an independent lightness scale, both centered.
  const placed = useMemo(() => {
    const raw = items.map((it) => ({ it, w: worldRaw(it.rgb, space) }));
    let maxR = 1e-6, zMin = Infinity, zMax = -Infinity;
    for (const { w } of raw) {
      maxR = Math.max(maxR, Math.hypot(w.x, w.y));
      zMin = Math.min(zMin, w.z);
      zMax = Math.max(zMax, w.z);
    }
    const hScale = 0.96 / maxR;
    const zMid = (zMin + zMax) / 2;
    const zHalf = Math.max((zMax - zMin) / 2, 0.05);
    const zScale = 0.92 / zHalf;
    return raw.map(({ it, w }) => ({
      it,
      v: { x: w.x * hScale, y: w.y * hScale, z: (w.z - zMid) * zScale } as Vec3,
    }));
  }, [items, space]);

  // Auto-rotate (paused while dragging; off under reduced motion).
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    const tick = () => {
      if (!drag.current) setYaw((y) => y + 0.004);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  // Non-passive wheel zoom (so the page doesn't scroll).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* none */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setYaw((y) => y + dx * 0.01);
    setPitch((p) => Math.max(-1.45, Math.min(1.45, p + dy * 0.01)));
    d.x = e.clientX; d.y = e.clientY;
  };
  const onUp = () => { drag.current = null; };

  // Build & depth-sort every primitive so occlusion is correct.
  const prims = useMemo(() => {
    const list: Prim[] = [];
    const P = (v: Vec3) => project(v, yaw, pitch, zoom);

    // Wire cube cage (data bounding box, ±1).
    const corners: Vec3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push({ x: sx, y: sy, z: sz });
    const projCorners = corners.map(P);
    const edges: [number, number][] = [];
    for (let i = 0; i < corners.length; i++)
      for (let j = i + 1; j < corners.length; j++) {
        const a = corners[i], b = corners[j];
        const diff = (a.x !== b.x ? 1 : 0) + (a.y !== b.y ? 1 : 0) + (a.z !== b.z ? 1 : 0);
        if (diff === 1) edges.push([i, j]);
      }
    for (const [i, j] of edges) {
      const a = projCorners[i], b = projCorners[j];
      list.push({ kind: "cage", depth: (a.depth + b.depth) / 2, a, b, w: 1, o: 0.32 });
    }

    // Floor grid at z = -1.
    const G = 4;
    for (let i = 0; i <= G; i++) {
      const t = -1 + (2 * i) / G;
      const a1 = P({ x: t, y: -1, z: -1 }), b1 = P({ x: t, y: 1, z: -1 });
      const a2 = P({ x: -1, y: t, z: -1 }), b2 = P({ x: 1, y: t, z: -1 });
      list.push({ kind: "cage", depth: (a1.depth + b1.depth) / 2, a: a1, b: b1, w: 0.75, o: 0.16 });
      list.push({ kind: "cage", depth: (a2.depth + b2.depth) / 2, a: a2, b: b2, w: 0.75, o: 0.16 });
    }

    // Hue ring at the floor — orients the chroma plane.
    const RING = 48;
    for (let k = 0; k < RING; k++) {
      const a0 = (k / RING) * Math.PI * 2, a1 = ((k + 1) / RING) * Math.PI * 2;
      const pa = P({ x: Math.cos(a0), y: Math.sin(a0), z: -1 });
      const pb = P({ x: Math.cos(a1), y: Math.sin(a1), z: -1 });
      const hueDeg = Math.round((a0 * 180) / Math.PI);
      list.push({ kind: "ring", depth: (pa.depth + pb.depth) / 2, a: pa, b: pb, color: `hsl(${hueDeg} 70% 55%)` });
    }

    // Vertical neutral (lightness) axis.
    const az0 = P({ x: 0, y: 0, z: -1 }), az1 = P({ x: 0, y: 0, z: 1 });
    list.push({ kind: "cage", depth: (az0.depth + az1.depth) / 2, a: az0, b: az1, w: 1.25, o: 0.4 });

    // Project the data points.
    const proj = placed.map(({ it, v }) => ({ it, v, p: P(v) }));

    // Drop lines to the floor (height cue).
    if (drops) {
      for (const { it, v, p } of proj) {
        const foot = P({ x: v.x, y: v.y, z: -1 });
        const dim = emphasize != null && it.ramp !== emphasize;
        list.push({ kind: "drop", depth: (p.depth + foot.depth) / 2, a: p, b: foot, color: it.css, dim });
      }
    }

    // Ramp links (connect each scale's stops in order).
    if (showLinks) {
      const byRamp = new Map<string, typeof proj>();
      for (const r of proj) (byRamp.get(r.it.ramp) ?? byRamp.set(r.it.ramp, []).get(r.it.ramp)!).push(r);
      for (const [ramp, group] of byRamp) {
        if (group.length < 2) continue;
        const emph = emphasize === ramp;
        const dim = emphasize != null && !emph;
        for (let i = 1; i < group.length; i++) {
          const a = group[i - 1].p, b = group[i].p;
          list.push({ kind: "link", depth: (a.depth + b.depth) / 2, a, b, emph, dim });
        }
      }
    }

    // Dots.
    for (const { it, p } of proj) {
      const emph = emphasize === it.ramp;
      const dim = emphasize != null && !emph;
      list.push({ kind: "dot", depth: p.depth, p, it, flagged: !!flagged?.has(it.token.name), dim, emph });
    }

    list.sort((a, b) => a.depth - b.depth); // far → near
    return list;
  }, [placed, yaw, pitch, zoom, showLinks, drops, emphasize, flagged]);

  // Depth fade: map depth (~ -1.3 .. 1.3) to an opacity multiplier.
  const fade = (d: number) => 0.45 + 0.55 * Math.min(1, Math.max(0, (d + 1.3) / 2.6));

  const axis = AXIS[space];

  return (
    <figure className="plot3d">
      <div className="plot3d-bar">
        <label className="toggle">
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
          Auto-rotate
        </label>
        <label className="toggle">
          <input type="checkbox" checked={drops} onChange={(e) => setDrops(e.target.checked)} />
          Drop lines
        </label>
        <button className="btn small" onClick={() => { setYaw(-0.6); setPitch(-0.5); setZoom(1); }}>Reset view</button>
        <span className="spacer" />
        <span className="faint mono" style={{ fontSize: 11 }}>{axis.note}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${S} ${S}`}
        className={`plot3d-svg ${drag.current ? "grabbing" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {prims.map((pr, i) => {
          if (pr.kind === "cage")
            return <line key={i} x1={pr.a.sx} y1={pr.a.sy} x2={pr.b.sx} y2={pr.b.sy} stroke="var(--border)" strokeWidth={pr.w} opacity={pr.o} style={{ pointerEvents: "none" }} />;
          if (pr.kind === "ring")
            return <line key={i} x1={pr.a.sx} y1={pr.a.sy} x2={pr.b.sx} y2={pr.b.sy} stroke={pr.color} strokeWidth={3} strokeLinecap="round" opacity={0.5} style={{ pointerEvents: "none" }} />;
          if (pr.kind === "drop")
            return <line key={i} x1={pr.a.sx} y1={pr.a.sy} x2={pr.b.sx} y2={pr.b.sy} stroke={pr.color} strokeWidth={1} opacity={pr.dim ? 0.05 : 0.22} style={{ pointerEvents: "none" }} />;
          if (pr.kind === "link")
            return <line key={i} x1={pr.a.sx} y1={pr.a.sy} x2={pr.b.sx} y2={pr.b.sy} stroke={pr.emph ? "var(--accent)" : "rgba(127,127,127,0.5)"} strokeWidth={pr.emph ? 2.4 : 1.4} opacity={pr.dim ? 0.12 : 1} style={{ pointerEvents: "none" }} />;
          const { p, it, flagged: fl, dim, emph } = pr;
          const r = Math.max(2.5, (emph ? 7.5 : 6) * p.scale);
          return (
            <circle
              key={i}
              cx={p.sx}
              cy={p.sy}
              r={r}
              fill={it.css}
              stroke={fl ? "var(--warning)" : emph ? "#fff" : "rgba(0,0,0,0.45)"}
              strokeWidth={fl ? 2.4 : emph ? 2 : 1.1}
              opacity={dim ? 0.12 : fade(p.depth)}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => onHoverRamp?.(it.ramp)}
              onMouseLeave={() => onHoverRamp?.(null)}
              onClick={() => { if (!drag.current?.moved) onPick?.(it.token.name); }}
            >
              <title>{`--${it.token.name}\n${it.hex}${fl ? "\n⚠ uneven lightness step" : ""}\nclick to edit`}</title>
            </circle>
          );
        })}
        {/* axis labels pinned to the cage extremities */}
        <AxisLabels yaw={yaw} pitch={pitch} zoom={zoom} axis={axis} />
      </svg>
      <figcaption className="mono faint">drag to orbit · scroll to zoom · click a dot to edit</figcaption>
    </figure>
  );
}

function AxisLabels({ yaw, pitch, zoom, axis }: { yaw: number; pitch: number; zoom: number; axis: AxisDef }) {
  const at = (v: Vec3) => project(v, yaw, pitch, zoom);
  const top = at({ x: 0, y: 0, z: 1.12 });
  const xEnd = at({ x: 1.16, y: 0, z: -1 });
  const yEnd = at({ x: 0, y: 1.16, z: -1 });
  const T = (p: Proj, s: string) => (
    <text x={p.sx} y={p.sy} textAnchor="middle" fontSize="11" fill="var(--text-faint)" style={{ pointerEvents: "none" }}>{s}</text>
  );
  return (<>{T(top, axis.z)}{T(xEnd, axis.x)}{T(yEnd, axis.y)}</>);
}

interface AxisDef { x: string; y: string; z: string; note: string }
const AXIS: Record<ColorSpace, AxisDef> = {
  oklab: { x: "+a red", y: "+b yellow", z: "L", note: "OKLab — a/b plane, lightness up" },
  cielab: { x: "+a* red", y: "+b* yellow", z: "L*", note: "CIELAB — a*/b* plane, lightness up" },
  hsl: { x: "hue→", y: "hue→", z: "L", note: "HSL cylinder — hue angle, saturation radius" },
};
