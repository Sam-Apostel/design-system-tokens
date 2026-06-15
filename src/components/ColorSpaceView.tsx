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
  type ColorSpace,
  type SpacePoint,
  type RGB,
} from "../lib/color";
import { buildRamps } from "../lib/groups";
import { rampMetrics, lightnessProfile, type RampMetrics, type LightnessStep } from "../lib/rampMetrics";
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

export function ColorSpaceView() {
  const { tokens, byName, dispatch } = useStore();
  const [space, setSpace] = useState<ColorSpace>("oklab");
  const [mode, setMode] = useState<PlotMode>("ab");
  const [showLinks, setShowLinks] = useState(true);
  const [fit, setFit] = useState(true);
  const [focusRamp, setFocusRamp] = useState<string | null>(null);
  const [hoverRamp, setHoverRamp] = useState<string | null>(null);
  const emphasize = hoverRamp ?? focusRamp;

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
          <div className="plot-hero">
            <Plot
              title="All colors"
              items={items}
              mode={mode}
              showLinks={showLinks}
              axis={axis}
              fit={fit}
              emphasize={emphasize}
              onHoverRamp={setHoverRamp}
              flagged={flagged}
              big
            />
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
                    Focusing {focusRamp} ✕
                  </button>
                )}
              </div>
              <div className="plot-grid">
                {scales.map(({ key, group, metrics, profile }) => {
                  const uneven = profile.filter((p) => p.flagged).length;
                  return (
                    <div
                      key={key}
                      className={`plot-cell ${focusRamp === key ? "focused" : ""}`}
                      onClick={() => setFocusRamp((cur) => (cur === key ? null : key))}
                      onMouseEnter={() => setHoverRamp(key)}
                      onMouseLeave={() => setHoverRamp((h) => (h === key ? null : h))}
                    >
                      <Plot title={key} items={group} mode={mode} showLinks={showLinks} axis={axis} fit={fit} metrics={metrics} flagged={flagged} uneven={uneven} />
                      <LightnessProfile steps={profile} items={group} />
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
              Each dot is a color token, filled with its real color and positioned by the selected color
              space. With <b>Fit to data</b> on, each plot zooms to its own colors so ramps fill the frame.
              Dots <span style={{ color: "var(--warning)" }}>ringed amber</span> are steps whose lightness
              deviates from an even ramp. Each scale's <b>lightness profile</b> plots L against the dashed
              ideal line — dots off that line are inconsistent; a kink that reverses direction is a
              non-monotonic step.
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
  metrics,
  emphasize,
  onHoverRamp,
  flagged,
  uneven,
}: {
  title: string;
  items: PlotItem[];
  mode: PlotMode;
  showLinks: boolean;
  axis: { x: string; y: string };
  fit: boolean;
  big?: boolean;
  metrics?: RampMetrics;
  emphasize?: string | null;
  onHoverRamp?: (ramp: string | null) => void;
  flagged?: Set<string>;
  uneven?: number;
}) {
  const bounds = useMemo(() => computeBounds(items, mode, fit), [items, mode, fit]);

  // Pan & zoom (hero plot only) by manipulating the SVG viewBox.
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: S, h: S });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const zoomed = view.w !== S || view.x !== 0 || view.y !== 0;

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

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!big) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!big || !drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / rect.width) * view.w;
    const dy = ((e.clientY - drag.current.y) / rect.height) * view.h;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  };
  const endDrag = () => {
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
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="var(--panel)" stroke="var(--border)" />
        {showOriginX && <line x1={ox} y1={PAD} x2={ox} y2={S - PAD} stroke="var(--border-soft)" />}
        {showOriginY && <line x1={PAD} y1={oy} x2={S - PAD} y2={oy} stroke="var(--border-soft)" />}
        <text x={S / 2} y={S - 8} textAnchor="middle" fontSize="12" fill="var(--text-faint)">
          {axis.x}
        </text>
        <text x={14} y={S / 2} textAnchor="middle" fontSize="12" fill="var(--text-faint)" transform={`rotate(-90 14 ${S / 2})`}>
          {axis.y}
        </text>
        {link?.map(({ ramp, pts }, i) => {
          const dim = emphasize != null && ramp !== emphasize;
          return (
            <polyline
              key={i}
              points={pts.map((p) => `${p.px},${p.py}`).join(" ")}
              fill="none"
              stroke={dim ? "var(--plot-line-dim)" : "var(--plot-line)"}
              strokeWidth={emphasize === ramp ? 2.5 : 1.5}
            />
          );
        })}
        {items.map((it) => {
          const { px, py } = project(it.pt, mode, bounds);
          const dim = emphasize != null && it.ramp !== emphasize;
          const isFlagged = flagged?.has(it.token.name);
          const stroke = isFlagged ? "var(--warning)" : emphasize === it.ramp ? "var(--plot-ring)" : "var(--hairline)";
          const sw = isFlagged ? 2.5 : emphasize === it.ramp ? 1.5 : 1;
          return (
            <circle
              key={it.token.id}
              cx={px}
              cy={py}
              r={big ? (emphasize === it.ramp ? 8 : 7) : 6}
              fill={it.css}
              stroke={stroke}
              strokeWidth={sw}
              opacity={dim ? 0.12 : 1}
              style={onHoverRamp ? { cursor: "pointer" } : undefined}
              onMouseEnter={onHoverRamp ? () => onHoverRamp(it.ramp) : undefined}
              onMouseLeave={onHoverRamp ? () => onHoverRamp(null) : undefined}
            >
              <title>{`--${it.token.name}\n${it.hex}${isFlagged ? "\n⚠ uneven lightness step" : ""}`}</title>
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
 * Lightness across a ramp vs an even ideal line. A straight diagonal of dots on
 * the line = evenly distributed; dots off the line (ringed amber) are the
 * inconsistent steps.
 */
function LightnessProfile({ steps, items }: { steps: LightnessStep[]; items: PlotItem[] }) {
  if (steps.length < 2) return null;
  const W = 240;
  const H = 84;
  const padX = 8;
  const padY = 10;
  const n = steps.length;

  const allL = steps.flatMap((s) => [s.L, s.ideal]);
  let lo = Math.min(...allL);
  let hi = Math.max(...allL);
  if (hi - lo < 1e-6) { lo -= 0.05; hi += 0.05; }
  const x = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
  const y = (L: number) => padY + (1 - (L - lo) / (hi - lo)) * (H - padY * 2);

  return (
    <div className="ramp-profile">
      <svg viewBox={`0 0 ${W} ${H}`} className="plot-svg" preserveAspectRatio="none">
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
          points={steps.map((s, i) => `${x(i)},${y(s.L)}`).join(" ")}
          fill="none"
          stroke="var(--plot-line)"
          strokeWidth={1.5}
        />
        {steps.map((s, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(s.L)}
            r={s.flagged ? 5 : 3.5}
            fill={items[i]?.css ?? "#000"}
            stroke={s.flagged ? "var(--warning)" : "var(--hairline)"}
            strokeWidth={s.flagged ? 2 : 1}
          >
            <title>{`--${items[i]?.token.name}\nL ${Math.round(s.L * 100)} (ideal ${Math.round(
              s.ideal * 100,
            )}, off ${s.residual >= 0 ? "+" : ""}${Math.round(s.residual * 100)})`}</title>
          </circle>
        ))}
      </svg>
      <div className="ramp-profile-cap mono faint">lightness vs even ramp</div>
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
