import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import {
  parseColor,
  toCssDisplay,
  toHex,
  toSpacePoint,
  rgbToOklab,
  oklabToRgb,
  editToRgb,
  slicePixel,
  type ColorSpace,
  type PlotPlane,
  type SpacePoint,
  type RGB,
} from "../lib/color";
import { buildRamps } from "../lib/groups";
import { tierMap } from "../lib/tiers";
import { isAlias } from "../lib/relations";
import { rampMetrics, lightnessProfile, type RampMetrics, type LightnessStep } from "../lib/rampMetrics";
import type { Token } from "../types";

type PlotMode = PlotPlane;

const SPACES: { id: ColorSpace; label: string }[] = [
  { id: "oklab", label: "OKLab / OKLCH" },
  { id: "cielab", label: "CIELAB" },
  { id: "hsl", label: "HSL" },
];
const MODES: { id: PlotMode; label: string }[] = [
  { id: "ab", label: "Chroma plane" },
  { id: "LC", label: "Lightness × Chroma" },
  { id: "LH", label: "Lightness × Hue" },
];

const S = 460;
const PAD = 34;
const INNER = S - PAD * 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface PlotItem {
  token: Token;
  rgb: RGB;
  hex: string;
  css: string;
  pt: SpacePoint;
  ramp: string;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Live drag preview: a stop shown at a new color before the edit is committed. */
type Preview = { id: string; rgb: RGB } | null;

/** Raw (un-normalized for plotting) coordinates per mode. */
function dataCoord(pt: SpacePoint, mode: PlotMode): { x: number; y: number } {
  if (mode === "ab") return { x: pt.x, y: pt.y };
  if (mode === "LC") return { x: pt.chroma, y: pt.lightness };
  return { x: ((pt.hue % 360) + 360) % 360, y: pt.lightness };
}

const ABSOLUTE: Record<PlotMode, Bounds> = {
  ab: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
  LC: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  LH: { minX: 0, maxX: 360, minY: 0, maxY: 1 },
};

/** Compute plot bounds — either the full color space, or fitted to the data. */
function computeBounds(items: PlotItem[], mode: PlotMode, fit: boolean): Bounds {
  if (!fit || items.length === 0) return ABSOLUTE[mode];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const it of items) {
    const c = dataCoord(it.pt, mode);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  if (!isFinite(minX)) return ABSOLUTE[mode];

  if (mode === "ab") {
    // Uniform scale so hue angles & chroma stay undistorted.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2, 0.02) * 1.24;
    return { minX: cx - half, maxX: cx + half, minY: cy - half, maxY: cy + half };
  }
  const padX = Math.max((maxX - minX) * 0.12, mode === "LH" ? 6 : 0.03);
  const padY = Math.max((maxY - minY) * 0.12, 0.03);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

/** Follow an alias chain to the token holding the literal value. */
function terminalToken(token: Token, byName: Map<string, Token>): Token {
  let cur = token;
  const seen = new Set([cur.name]);
  while (cur.value.kind === "ref") {
    const next = byName.get(cur.value.ref);
    if (!next || seen.has(next.name)) break;
    seen.add(next.name);
    cur = next;
  }
  return cur;
}

function project(pt: SpacePoint, mode: PlotMode, b: Bounds): { px: number; py: number } {
  const c = dataCoord(pt, mode);
  const px = PAD + ((c.x - b.minX) / (b.maxX - b.minX || 1)) * INNER;
  const py = PAD + (1 - (c.y - b.minY) / (b.maxY - b.minY || 1)) * INNER;
  return { px, py };
}

/** The fixed value of the dimension a plane doesn't show, averaged over a scale. */
function heldFor(items: PlotItem[], space: ColorSpace, plane: PlotMode): number {
  if (items.length === 0) {
    if (plane === "ab") return space === "cielab" ? 70 : 0.7;
    if (plane === "LC") return 265;
    return space === "oklab" ? 0.13 : space === "cielab" ? 45 : 0.6;
  }
  if (plane === "LC") {
    let sx = 0, sy = 0;
    for (const it of items) {
      const hr = (it.pt.hue * Math.PI) / 180;
      sx += Math.cos(hr);
      sy += Math.sin(hr);
    }
    let h = (Math.atan2(sy, sx) * 180) / Math.PI;
    if (h < 0) h += 360;
    return h;
  }
  let sum = 0;
  for (const it of items) {
    if (plane === "ab") sum += space === "cielab" ? it.pt.lightness * 100 : it.pt.lightness;
    else sum += space === "oklab" ? it.pt.chroma * 0.4 : space === "cielab" ? it.pt.chroma * 128 : it.pt.chroma;
  }
  return sum / items.length;
}

function sliceLabel(space: ColorSpace, plane: PlotMode, held: number): string {
  if (plane === "ab") return space === "hsl" ? `L ${Math.round(held * 100)}` : space === "cielab" ? `L* ${Math.round(held)}` : `L ${Math.round(held * 100)}`;
  if (plane === "LC") return `hue ${Math.round(held)}°`;
  return space === "hsl" ? `S ${Math.round(held * 100)}` : `C ${held.toFixed(space === "cielab" ? 0 : 2)}`;
}

export function ColorSpaceView() {
  const { tokens, byName, dispatch } = useStore();
  const [space, setSpace] = useState<ColorSpace>("oklab");
  const [mode, setMode] = useState<PlotMode>("ab");
  const [showLinks, setShowLinks] = useState(true);
  const [fit, setFit] = useState(true);
  // The painted color-space slice is a single 2D cross-section at one fixed third
  // dimension, while every dot has its own — so dots legitimately sit "off" the
  // slice's color. It's a frequent source of confusion, so it's off by default;
  // turn it on deliberately when reading a single plane.
  const [showSlice, setShowSlice] = useState(false);
  const [focusRamp, setFocusRamp] = useState<string | null>(null);
  const [hoverRamp, setHoverRamp] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const emphasize = hoverRamp ?? focusRamp;
  const heroRef = useRef<HTMLDivElement>(null);

  // Select a scale: focus it for editing and bring the big map into view so the
  // cause (clicking a card) and effect (its stops become draggable) are visible.
  const selectRamp = (key: string) => {
    setFocusRamp((cur) => {
      const next = cur === key ? null : key;
      if (next) requestAnimationFrame(() => heroRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      return next;
    });
  };

  const idToken = useMemo(() => new Map(tokens.map((t) => [t.id, t])), [tokens]);

  // Only primitive color scales belong here — the color-space plot/editing acts
  // on raw ramps (drag a stop), not semantic tokens or alias ramps that merely
  // point at a primitive. Keep primitive-tier AND raw-valued colors: that drops
  // semantic raw tokens (--background light-dark(...)), alias status ramps
  // (--danger-* → red-*), and component aliases alike. The "other" one-offs
  // bucket is skipped too, since it's a grab-bag, not a coherent scale.
  const tiers = useMemo(() => tierMap(tokens), [tokens]);
  const items = useMemo<PlotItem[]>(() => {
    const colors = tokens.filter(
      (t) => t.category === "color" && tiers.get(t.name) === "primitive" && !isAlias(t),
    );
    const rampKey = new Map<string, string>();
    for (const ramp of buildRamps(colors)) {
      if (ramp.misc) continue; // one-offs aren't a scale
      for (const t of ramp.tokens) rampKey.set(t.id, ramp.key);
    }
    const out: PlotItem[] = [];
    for (const t of colors) {
      const r = resolve(t, byName);
      const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
      if (!rgb) continue;
      out.push({
        token: t,
        rgb,
        hex: toHex(rgb),
        css: toCssDisplay(rgb),
        pt: toSpacePoint(rgb, space),
        ramp: rampKey.get(t.id) ?? t.name,
      });
    }
    return out;
  }, [tokens, byName, space, tiers]);

  // Real scales only (≥2 distinct colors), each with quality metrics + a
  // per-step lightness profile, sorted worst-first.
  const scales = useMemo(() => {
    const m = new Map<string, PlotItem[]>();
    for (const it of items) (m.get(it.ramp) ?? m.set(it.ramp, []).get(it.ramp)!).push(it);
    return [...m.entries()]
      .filter(([, g]) => new Set(g.map((i) => i.hex)).size >= 2)
      .map(([key, group]) => ({
        key,
        group,
        metrics: rampMetrics(group.map((i) => i.rgb)),
        profile: lightnessProfile(group.map((i) => i.rgb)),
      }))
      .sort((a, b) => b.metrics.unevenness - a.metrics.unevenness);
  }, [items]);

  // Names of steps that deviate from an even lightness ramp — ringed in plots.
  const flagged = useMemo(() => {
    const set = new Set<string>();
    for (const s of scales) s.profile.forEach((p, i) => p.flagged && set.add(s.group[i].token.name));
    return set;
  }, [scales]);

  const totalUneven = useMemo(
    () => scales.reduce((a, s) => a + s.profile.filter((p) => p.flagged).length, 0),
    [scales],
  );

  // Snap flagged steps onto the even-lightness line, keeping each step's hue &
  // chroma (OKLab a/b). Edits the terminal raw token so aliases stay intact.
  const fixSteps = (group: PlotItem[], profile: LightnessStep[]) => {
    profile.forEach((p, i) => {
      if (!p.flagged) return;
      const ok = rgbToOklab(group[i].rgb);
      const fixed = oklabToRgb(p.ideal, ok.a, ok.b);
      const target = terminalToken(group[i].token, byName);
      dispatch({ type: "setValue", id: target.id, raw: toHex({ ...fixed, a: 1 }) });
    });
  };
  const fixAll = () => scales.forEach((s) => fixSteps(s.group, s.profile));

  // Drag editing: preview live, commit once (one undo step) on release.
  const editMove = (id: string, rgb: RGB) => setPreview({ id, rgb });
  const editEnd = (id: string, rgb: RGB) => {
    const t = idToken.get(id);
    if (t) {
      const target = terminalToken(t, byName);
      dispatch({ type: "setValue", id: target.id, raw: toHex({ ...rgb, a: 1 }) });
    }
    setPreview(null);
  };

  const axis = AXIS_LABELS[mode][space];

  return (
    <div>
      <div className="section-title">Color space</div>
      <div className="plot-controls">
        <div className="seg">
          {SPACES.map((s) => (
            <button key={s.id} className={space === s.id ? "active" : ""} onClick={() => setSpace(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="seg">
          {MODES.map((m) => (
            <button key={m.id} className={mode === m.id ? "active" : ""} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} />
          Fit to data
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} />
          Connect ramps
        </label>
        <label className="toggle" title="Paint the color-space cross-section behind the dots (one fixed third dimension)">
          <input type="checkbox" checked={showSlice} onChange={(e) => setShowSlice(e.target.checked)} />
          Gamut slice
        </label>
        {totalUneven > 0 && (
          <button className="btn small" onClick={fixAll} title="Snap every flagged step onto its even-lightness ideal">
            Fix all {totalUneven} uneven
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty">No resolvable colors to plot.</div>
      ) : (
        <>
          <div className="plot-hero" ref={heroRef}>
            <Plot
              title="All colors"
              items={items}
              space={space}
              mode={mode}
              showLinks={showLinks}
              showSlice={showSlice}
              axis={axis}
              fit={fit}
              emphasize={emphasize}
              onHoverRamp={setHoverRamp}
              flagged={flagged}
              editRamp={focusRamp}
              preview={preview}
              onEditMove={editMove}
              onEditEnd={editEnd}
              big
            />
            {focusRamp ? (
              <p className="hint plot-edit-hint">
                Editing <b className="mono">{focusRamp}</b> — drag its stops on the plane to recolor them.
                <button className="btn small" style={{ marginLeft: 10 }} onClick={() => setFocusRamp(null)}>Done</button>
              </p>
            ) : (
              scales.length > 0 && <p className="hint plot-edit-hint">Select a scale below to drag its stops directly on the map.</p>
            )}
          </div>

          {scales.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 24 }}>
                Per scale <span className="count">({scales.length})</span>
                <span className="faint" style={{ fontSize: 11, textTransform: "none", letterSpacing: 0 }}>
                  sorted most-uneven first
                </span>
                <div className="spacer" />
                {focusRamp && (
                  <button className="btn small" onClick={() => setFocusRamp(null)}>
                    Editing {focusRamp} ✕
                  </button>
                )}
              </div>
              <div className="plot-grid">
                {scales.map(({ key, group, metrics, profile }) => {
                  const uneven = profile.filter((p) => p.flagged).length;
                  const isFocused = focusRamp === key;
                  return (
                    <div
                      key={key}
                      className={`plot-cell ${isFocused ? "focused" : ""}`}
                      onClick={() => selectRamp(key)}
                      onMouseEnter={() => setHoverRamp(key)}
                      onMouseLeave={() => setHoverRamp((h) => (h === key ? null : h))}
                    >
                      <Plot
                        title={key}
                        items={group}
                        space={space}
                        mode={mode}
                        showLinks={showLinks}
                        showSlice={showSlice}
                        axis={axis}
                        fit={fit}
                        metrics={metrics}
                        flagged={flagged}
                        uneven={uneven}
                        editRamp={isFocused ? key : null}
                        preview={preview}
                        onEditMove={editMove}
                        onEditEnd={editEnd}
                      />
                      <LightnessProfile
                        steps={profile}
                        items={group}
                        editable={isFocused}
                        preview={preview}
                        onEditMove={editMove}
                        onEditEnd={editEnd}
                      />
                      {uneven > 0 && (
                        <button
                          className="btn small fix-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            fixSteps(group, profile);
                          }}
                          title="Snap flagged steps onto the even-lightness line"
                        >
                          Snap {uneven} to even L
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="card" style={{ marginTop: 24 }}>
            <div className="section-title">How to read this</div>
            <p className="hint" style={{ marginTop: 0 }}>
              Each dot is a color token, filled with its real color; ramps are linked in order. Select a
              scale (below or by clicking the big map) to make its stops <b>draggable</b> — move them on the
              plane to retune hue/chroma/lightness, or drag points on the <b>lightness profile</b> to set
              lightness directly. One undo step per drag. Dots
              <span style={{ color: "var(--warning)" }}> ringed amber</span> deviate from an even ramp.
              Turn on <b>Gamut slice</b> to paint the color space behind the dots — note it's a single 2D
              cross-section (one fixed third dimension), so dots can sit over a non-matching color.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Plot({
  title,
  items,
  space,
  mode,
  showLinks,
  showSlice,
  axis,
  fit,
  big,
  metrics,
  emphasize,
  onHoverRamp,
  flagged,
  uneven,
  editRamp,
  preview,
  onEditMove,
  onEditEnd,
}: {
  title: string;
  items: PlotItem[];
  space: ColorSpace;
  mode: PlotMode;
  showLinks: boolean;
  showSlice?: boolean;
  axis: { x: string; y: string };
  fit: boolean;
  big?: boolean;
  metrics?: RampMetrics;
  emphasize?: string | null;
  onHoverRamp?: (ramp: string | null) => void;
  flagged?: Set<string>;
  uneven?: number;
  editRamp?: string | null;
  preview?: Preview;
  onEditMove?: (id: string, rgb: RGB) => void;
  onEditEnd?: (id: string, rgb: RGB) => void;
}) {
  const bounds = useMemo(() => computeBounds(items, mode, fit), [items, mode, fit]);

  // Pan & zoom (hero plot only) by manipulating the SVG viewBox.
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: S, h: S });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const edit = useRef<{ id: string; base: RGB } | null>(null);
  const justEdited = useRef(false);
  const zoomed = view.w !== S || view.x !== 0 || view.y !== 0;

  // Paint the color-space slice as a background image (out-of-gamut = transparent).
  const held = useMemo(() => heldFor(items, space, mode), [items, space, mode]);
  const bgUrl = useMemo(() => {
    if (!showSlice) return null;
    // Render close to the displayed pixel size (capped) so the slice isn't a
    // blurry/blocky upscale of a tiny canvas.
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const res = Math.round((big ? 300 : 120) * dpr);
    const dxr = bounds.maxX - bounds.minX;
    const dyr = bounds.maxY - bounds.minY;
    const cnv = document.createElement("canvas");
    cnv.width = res;
    cnv.height = res;
    const ctx = cnv.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(res, res);
    const d = img.data;
    for (let py = 0; py < res; py++) {
      const dy = bounds.minY + (1 - py / (res - 1)) * dyr;
      for (let px = 0; px < res; px++) {
        const dx = bounds.minX + (px / (res - 1)) * dxr;
        const rgb = slicePixel(space, mode, dx, dy, held);
        if (!rgb) continue;
        const o = (py * res + px) * 4;
        d[o] = Math.round(rgb.r * 255);
        d[o + 1] = Math.round(rgb.g * 255);
        d[o + 2] = Math.round(rgb.b * 255);
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cnv.toDataURL();
  }, [space, mode, bounds, held, big, showSlice]);

  // Reset the view whenever what's plotted changes.
  useEffect(() => {
    if (big) setView({ x: 0, y: 0, w: S, h: S });
  }, [big, mode, fit, items]);

  // Non-passive wheel listener so we can preventDefault page scroll.
  useEffect(() => {
    if (!big) return;
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) => {
        const sx = v.x + ((e.clientX - rect.left) / rect.width) * v.w;
        const sy = v.y + ((e.clientY - rect.top) / rect.height) * v.h;
        const factor = e.deltaY < 0 ? 0.85 : 1.15;
        const w = Math.max(S * 0.08, Math.min(S, v.w * factor));
        const nx = sx - ((sx - v.x) / v.w) * w;
        const ny = sy - ((sy - v.y) / v.h) * w;
        return { x: nx, y: ny, w, h: w };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [big]);

  // Pointer position → data coordinates of the current plane.
  const eventToData = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svgRef.current!;
    const rect = el.getBoundingClientRect();
    let sx: number, sy: number;
    if (big) {
      sx = view.x + ((e.clientX - rect.left) / rect.width) * view.w;
      sy = view.y + ((e.clientY - rect.top) / rect.height) * view.h;
    } else {
      sx = ((e.clientX - rect.left) / rect.width) * S;
      sy = ((e.clientY - rect.top) / rect.height) * S;
    }
    const dx = bounds.minX + ((sx - PAD) / INNER) * (bounds.maxX - bounds.minX);
    const dy = bounds.minY + (1 - (sy - PAD) / INNER) * (bounds.maxY - bounds.minY);
    return { dx, dy };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!big) return; // pan is hero-only; dot drags start on the circle
    drag.current = { x: e.clientX, y: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (edit.current) {
      const { dx, dy } = eventToData(e);
      onEditMove?.(edit.current.id, editToRgb(space, mode, dx, dy, edit.current.base));
      return;
    }
    if (!big || !drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / rect.width) * view.w;
    const dy = ((e.clientY - drag.current.y) / rect.height) * view.h;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (edit.current) {
      const { dx, dy } = eventToData(e);
      onEditEnd?.(edit.current.id, editToRgb(space, mode, dx, dy, edit.current.base));
      edit.current = null;
      justEdited.current = true;
      return;
    }
    drag.current = null;
  };

  const link = useMemo(() => {
    if (!showLinks) return null;
    const m = new Map<string, PlotItem[]>();
    for (const it of items) (m.get(it.ramp) ?? m.set(it.ramp, []).get(it.ramp)!).push(it);
    return [...m.entries()]
      .filter(([, g]) => g.length > 1)
      .map(([ramp, g]) => ({ ramp, pts: g.map((it) => project(it.pt, mode, bounds)) }));
  }, [items, mode, showLinks, bounds]);

  // Origin crosshair (only meaningful in the chroma plane, and only if in view).
  const showOriginX = mode === "ab" && 0 > bounds.minX && 0 < bounds.maxX;
  const showOriginY = mode === "ab" && 0 > bounds.minY && 0 < bounds.maxY;
  const ox = PAD + ((0 - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * INNER;
  const oy = PAD + (1 - (0 - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * INNER;

  return (
    <figure className={`plot ${big ? "big" : ""}`}>
      {big && zoomed && (
        <button className="btn small plot-reset" onClick={() => setView({ x: 0, y: 0, w: S, h: S })}>
          Reset view
        </button>
      )}
      <svg
        ref={svgRef}
        viewBox={big ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${S} ${S}`}
        className={`plot-svg ${big ? "interactive" : ""}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { if (!edit.current) drag.current = null; }}
        onClickCapture={(e) => { if (justEdited.current) { e.stopPropagation(); justEdited.current = false; } }}
      >
        <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="var(--panel)" stroke="var(--border)" />
        {bgUrl && (
          <image href={bgUrl} x={PAD} y={PAD} width={INNER} height={INNER} preserveAspectRatio="none" style={{ pointerEvents: "none" }} />
        )}
        <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="none" stroke="var(--border)" style={{ pointerEvents: "none" }} />
        {showOriginX && <line x1={ox} y1={PAD} x2={ox} y2={S - PAD} stroke="var(--hairline)" style={{ pointerEvents: "none" }} />}
        {showOriginY && <line x1={PAD} y1={oy} x2={S - PAD} y2={oy} stroke="var(--hairline)" style={{ pointerEvents: "none" }} />}
        <text x={S / 2} y={S - 8} textAnchor="middle" fontSize="12" fill="var(--text-faint)" style={{ pointerEvents: "none" }}>
          {axis.x}
        </text>
        <text x={14} y={S / 2} textAnchor="middle" fontSize="12" fill="var(--text-faint)" transform={`rotate(-90 14 ${S / 2})`} style={{ pointerEvents: "none" }}>
          {axis.y}
        </text>
        {showSlice && (
          <text x={PAD + 6} y={PAD + 15} fontSize="11" fontFamily="var(--mono)" fill="var(--text)" opacity="0.65" style={{ pointerEvents: "none" }}>
            {sliceLabel(space, mode, held)}
          </text>
        )}
        {link?.map(({ ramp, pts }, i) => {
          const dim = emphasize != null && ramp !== emphasize;
          return (
            <polyline
              key={i}
              points={pts.map((p) => `${p.px},${p.py}`).join(" ")}
              fill="none"
              stroke={dim ? "var(--plot-line-dim)" : "rgba(127,127,127,0.55)"}
              strokeWidth={emphasize === ramp ? 2.5 : 1.5}
              style={{ pointerEvents: "none" }}
            />
          );
        })}
        {items.map((it) => {
          const isPrev = preview?.id === it.token.id;
          const rgb = isPrev ? preview!.rgb : it.rgb;
          const pt = isPrev ? toSpacePoint(rgb, space) : it.pt;
          const css = isPrev ? toCssDisplay(rgb) : it.css;
          const { px, py } = project(pt, mode, bounds);
          const dim = emphasize != null && it.ramp !== emphasize;
          const isFlagged = flagged?.has(it.token.name);
          const editable = editRamp != null && it.ramp === editRamp;
          const stroke = isFlagged ? "var(--warning)" : editable ? "#fff" : "rgba(0,0,0,0.5)";
          const sw = isFlagged ? 2.5 : editable ? 2 : 1.25;
          return (
            <circle
              key={it.token.id}
              cx={px}
              cy={py}
              r={big ? (editable || emphasize === it.ramp ? 8 : 7) : editable ? 6 : 5}
              fill={css}
              stroke={stroke}
              strokeWidth={sw}
              opacity={dim ? 0.12 : 1}
              style={{ cursor: editable ? "grab" : onHoverRamp ? "pointer" : "default" }}
              onPointerDown={
                editable
                  ? (e) => {
                      e.stopPropagation();
                      edit.current = { id: it.token.id, base: it.rgb };
                      try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
                    }
                  : undefined
              }
              onClick={editable ? (e) => e.stopPropagation() : undefined}
              onMouseEnter={onHoverRamp && !editable ? () => onHoverRamp(it.ramp) : undefined}
              onMouseLeave={onHoverRamp && !editable ? () => onHoverRamp(null) : undefined}
            >
              <title>{`--${it.token.name}\n${isPrev ? toHex(rgb) : it.hex}${isFlagged ? "\n⚠ uneven lightness step" : ""}${editable ? "\n drag to edit" : ""}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mono">{title}</figcaption>
      {metrics && (
        <div className="plot-metrics mono">
          <span className={metrics.lightnessEvenness < 0.7 ? "warn" : ""}>
            ΔL {Math.round(metrics.lightnessEvenness * 100)}%
          </span>
          <span className={metrics.hueDrift > 25 ? "warn" : ""}>
            {metrics.hueDrift < 1 ? "hue steady" : `hue ±${Math.round(metrics.hueDrift)}°`}
          </span>
          {uneven != null && uneven > 0 && <span className="warn">{uneven} uneven</span>}
        </div>
      )}
    </figure>
  );
}

/**
 * Lightness across a ramp vs an even ideal line. When editable, drag a dot up or
 * down to set that step's lightness directly (hue & chroma preserved).
 */
function LightnessProfile({
  steps,
  items,
  editable,
  preview,
  onEditMove,
  onEditEnd,
}: {
  steps: LightnessStep[];
  items: PlotItem[];
  editable?: boolean;
  preview?: Preview;
  onEditMove?: (id: string, rgb: RGB) => void;
  onEditEnd?: (id: string, rgb: RGB) => void;
}) {
  const W = 240;
  const H = 84;
  const padX = 8;
  const padY = 10;
  const svgRef = useRef<SVGSVGElement>(null);
  const edit = useRef<{ id: string; base: RGB } | null>(null);

  const n = steps.length;
  const lvl = (i: number) => {
    const isPrev = preview?.id === items[i]?.token.id;
    return isPrev ? clamp01(rgbToOklab(preview!.rgb).L) : steps[i].L;
  };

  if (n < 2) return null;

  const allL = steps.flatMap((s, i) => [lvl(i), s.ideal]);
  let lo = Math.min(...allL);
  let hi = Math.max(...allL);
  if (hi - lo < 1e-6) { lo -= 0.05; hi += 0.05; }
  const x = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
  const y = (L: number) => padY + (1 - (L - lo) / (hi - lo)) * (H - padY * 2);
  const yToL = (clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sy = ((clientY - rect.top) / rect.height) * H;
    return clamp01(lo + (1 - (sy - padY) / (H - padY * 2)) * (hi - lo));
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!edit.current) return;
    const o = rgbToOklab(edit.current.base);
    onEditMove?.(edit.current.id, { ...oklabToRgb(yToL(e.clientY), o.a, o.b), a: edit.current.base.a });
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!edit.current) return;
    const o = rgbToOklab(edit.current.base);
    onEditEnd?.(edit.current.id, { ...oklabToRgb(yToL(e.clientY), o.a, o.b), a: edit.current.base.a });
    edit.current = null;
  };

  return (
    <div className="ramp-profile">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="plot-svg"
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onClickCapture={(e) => e.stopPropagation()}
      >
        {/* ideal even-distribution line */}
        <line
          x1={x(0)}
          y1={y(steps[0].ideal)}
          x2={x(n - 1)}
          y2={y(steps[n - 1].ideal)}
          stroke="var(--text-faint)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        {/* actual lightness path */}
        <polyline
          points={steps.map((_, i) => `${x(i)},${y(lvl(i))}`).join(" ")}
          fill="none"
          stroke="var(--plot-line)"
          strokeWidth={1.5}
        />
        {steps.map((s, i) => {
          const isPrev = preview?.id === items[i]?.token.id;
          const fill = isPrev ? toCssDisplay(preview!.rgb) : items[i]?.css ?? "#000";
          return (
            <circle
              key={i}
              cx={x(i)}
              cy={y(lvl(i))}
              r={editable ? 5 : s.flagged ? 5 : 3.5}
              fill={fill}
              stroke={s.flagged ? "var(--warning)" : editable ? "#fff" : "var(--hairline)"}
              strokeWidth={s.flagged ? 2 : editable ? 1.6 : 1}
              style={{ cursor: editable ? "ns-resize" : "default" }}
              onPointerDown={
                editable
                  ? (e) => {
                      e.stopPropagation();
                      edit.current = { id: items[i].token.id, base: items[i].rgb };
                      try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
                    }
                  : undefined
              }
            >
              <title>{`--${items[i]?.token.name}\nL ${Math.round(lvl(i) * 100)} (ideal ${Math.round(
                s.ideal * 100,
              )})${editable ? "\n drag to set lightness" : ""}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="ramp-profile-cap mono faint">lightness vs even ramp{editable ? " · drag to edit" : ""}</div>
    </div>
  );
}

const AXIS_LABELS: Record<PlotMode, Record<ColorSpace, { x: string; y: string }>> = {
  ab: {
    oklab: { x: "a (green ↔ red)", y: "b (blue ↔ yellow)" },
    cielab: { x: "a* (green ↔ red)", y: "b* (blue ↔ yellow)" },
    hsl: { x: "sat × cos(hue)", y: "sat × sin(hue)" },
  },
  LC: {
    oklab: { x: "chroma", y: "lightness (L)" },
    cielab: { x: "chroma", y: "lightness (L*)" },
    hsl: { x: "saturation", y: "lightness" },
  },
  LH: {
    oklab: { x: "hue (°)", y: "lightness (L)" },
    cielab: { x: "hue (°)", y: "lightness (L*)" },
    hsl: { x: "hue (°)", y: "lightness" },
  },
};
