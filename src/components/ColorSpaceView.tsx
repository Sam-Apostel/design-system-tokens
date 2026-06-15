import { useMemo, useState } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import {
  parseColor,
  toCssDisplay,
  toHex,
  toSpacePoint,
  type ColorSpace,
  type SpacePoint,
  type RGB,
} from "../lib/color";
import { buildRamps } from "../lib/groups";
import type { Token } from "../types";

type PlotMode = "ab" | "LC" | "LH";

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
    const half = Math.max((maxX - minX) / 2, (maxY - minY) / 2, 0.02) * 1.18;
    return { minX: cx - half, maxX: cx + half, minY: cy - half, maxY: cy + half };
  }
  const padX = Math.max((maxX - minX) * 0.12, mode === "LH" ? 6 : 0.03);
  const padY = Math.max((maxY - minY) * 0.12, 0.03);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function project(pt: SpacePoint, mode: PlotMode, b: Bounds): { px: number; py: number } {
  const c = dataCoord(pt, mode);
  const px = PAD + ((c.x - b.minX) / (b.maxX - b.minX || 1)) * INNER;
  const py = PAD + (1 - (c.y - b.minY) / (b.maxY - b.minY || 1)) * INNER;
  return { px, py };
}

export function ColorSpaceView() {
  const { tokens, byName } = useStore();
  const [space, setSpace] = useState<ColorSpace>("oklab");
  const [mode, setMode] = useState<PlotMode>("ab");
  const [showLinks, setShowLinks] = useState(true);
  const [fit, setFit] = useState(true);

  const items = useMemo<PlotItem[]>(() => {
    const colors = tokens.filter((t) => t.category === "color");
    const rampKey = new Map<string, string>();
    for (const ramp of buildRamps(colors)) for (const t of ramp.tokens) rampKey.set(t.id, ramp.key);
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
  }, [tokens, byName, space]);

  const scales = useMemo(() => {
    const m = new Map<string, PlotItem[]>();
    for (const it of items) (m.get(it.ramp) ?? m.set(it.ramp, []).get(it.ramp)!).push(it);
    return [...m.entries()].filter(([, g]) => g.length >= 2).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

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
      </div>

      {items.length === 0 ? (
        <div className="empty">No resolvable colors to plot.</div>
      ) : (
        <>
          <div className="plot-hero">
            <Plot title="All colors" items={items} mode={mode} showLinks={showLinks} axis={axis} fit={fit} big />
          </div>

          {scales.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 24 }}>
                Per scale <span className="count">({scales.length})</span>
              </div>
              <div className="plot-grid">
                {scales.map(([key, group]) => (
                  <Plot key={key} title={key} items={group} mode={mode} showLinks={showLinks} axis={axis} fit={fit} />
                ))}
              </div>
            </>
          )}

          <div className="card" style={{ marginTop: 24 }}>
            <div className="section-title">How to read this</div>
            <p className="hint" style={{ marginTop: 0 }}>
              Each dot is a color token, filled with its real color and positioned by the selected color
              space. With <b>Fit to data</b> on, each plot zooms to its own colors so ramps fill the frame;
              turn it off to compare every plot on the full color-space scale. Connected lines trace each
              ramp so uneven hue/lightness steps stand out.
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
  mode,
  showLinks,
  axis,
  fit,
  big,
}: {
  title: string;
  items: PlotItem[];
  mode: PlotMode;
  showLinks: boolean;
  axis: { x: string; y: string };
  fit: boolean;
  big?: boolean;
}) {
  const bounds = useMemo(() => computeBounds(items, mode, fit), [items, mode, fit]);

  const link = useMemo(() => {
    if (!showLinks) return null;
    const m = new Map<string, PlotItem[]>();
    for (const it of items) (m.get(it.ramp) ?? m.set(it.ramp, []).get(it.ramp)!).push(it);
    return [...m.values()]
      .filter((g) => g.length > 1)
      .map((g) => g.map((it) => project(it.pt, mode, bounds)));
  }, [items, mode, showLinks, bounds]);

  // Origin crosshair (only meaningful in the chroma plane, and only if in view).
  const showOriginX = mode === "ab" && 0 > bounds.minX && 0 < bounds.maxX;
  const showOriginY = mode === "ab" && 0 > bounds.minY && 0 < bounds.maxY;
  const ox = PAD + ((0 - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * INNER;
  const oy = PAD + (1 - (0 - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * INNER;

  return (
    <figure className={`plot ${big ? "big" : ""}`}>
      <svg viewBox={`0 0 ${S} ${S}`} className="plot-svg" preserveAspectRatio="xMidYMid meet">
        <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="var(--panel)" stroke="var(--border)" />
        {showOriginX && <line x1={ox} y1={PAD} x2={ox} y2={S - PAD} stroke="var(--border-soft)" />}
        {showOriginY && <line x1={PAD} y1={oy} x2={S - PAD} y2={oy} stroke="var(--border-soft)" />}
        <text x={S / 2} y={S - 8} textAnchor="middle" fontSize="12" fill="var(--text-faint)">
          {axis.x}
        </text>
        <text x={14} y={S / 2} textAnchor="middle" fontSize="12" fill="var(--text-faint)" transform={`rotate(-90 14 ${S / 2})`}>
          {axis.y}
        </text>
        {link?.map((pts, i) => (
          <polyline key={i} points={pts.map((p) => `${p.px},${p.py}`).join(" ")} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
        ))}
        {items.map((it) => {
          const { px, py } = project(it.pt, mode, bounds);
          return (
            <circle key={it.token.id} cx={px} cy={py} r={big ? 7 : 6} fill={it.css} stroke="rgba(0,0,0,0.5)" strokeWidth={1}>
              <title>{`--${it.token.name}\n${it.hex}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="mono">{title}</figcaption>
    </figure>
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
