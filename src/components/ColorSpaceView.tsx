import { useMemo, useState } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, toHex, toSpacePoint, type ColorSpace, type SpacePoint } from "../lib/color";
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
  hex: string;
  css: string;
  pt: SpacePoint;
  ramp: string;
}

function project(pt: SpacePoint, mode: PlotMode): { px: number; py: number } {
  if (mode === "ab") return { px: PAD + ((pt.x + 1) / 2) * INNER, py: PAD + ((1 - pt.y) / 2) * INNER };
  if (mode === "LC") return { px: PAD + pt.chroma * INNER, py: PAD + (1 - pt.lightness) * INNER };
  const h = ((pt.hue % 360) + 360) % 360;
  return { px: PAD + (h / 360) * INNER, py: PAD + (1 - pt.lightness) * INNER };
}

export function ColorSpaceView() {
  const { tokens, byName } = useStore();
  const [space, setSpace] = useState<ColorSpace>("oklab");
  const [mode, setMode] = useState<PlotMode>("ab");
  const [showLinks, setShowLinks] = useState(true);

  const items = useMemo<PlotItem[]>(() => {
    const colors = tokens.filter((t) => t.category === "color");
    const rampKey = new Map<string, string>();
    for (const ramp of buildRamps(colors)) for (const t of ramp.tokens) rampKey.set(t.id, ramp.key);
    const out: PlotItem[] = [];
    for (const t of colors) {
      const r = resolve(t, byName);
      const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
      if (!rgb) continue;
      out.push({ token: t, hex: toHex(rgb), css: toCssDisplay(rgb), pt: toSpacePoint(rgb, space), ramp: rampKey.get(t.id) ?? t.name });
    }
    return out;
  }, [tokens, byName, space]);

  // Per-scale groups (ramps with at least 2 plottable colors).
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
          <input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} />
          Connect ramps
        </label>
      </div>

      {items.length === 0 ? (
        <div className="empty">No resolvable colors to plot.</div>
      ) : (
        <>
          <div className="plot-hero">
            <Plot title="All colors" items={items} mode={mode} showLinks={showLinks} axis={axis} big />
          </div>

          {scales.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 24 }}>
                Per scale <span className="count">({scales.length})</span>
              </div>
              <div className="plot-grid">
                {scales.map(([key, group]) => (
                  <Plot key={key} title={key} items={group} mode={mode} showLinks={showLinks} axis={axis} />
                ))}
              </div>
            </>
          )}

          <div className="card" style={{ marginTop: 24 }}>
            <div className="section-title">How to read this</div>
            <p className="hint" style={{ marginTop: 0 }}>
              Each dot is a color token, filled with its real color and positioned by the selected color
              space. Switch spaces to see how the same colors relocate; connected lines trace each ramp
              (e.g. <span className="mono">colors-blue-*</span>) so uneven hue/lightness steps stand out.
              The small plots isolate one scale each.
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
  big,
}: {
  title: string;
  items: PlotItem[];
  mode: PlotMode;
  showLinks: boolean;
  axis: { x: string; y: string };
  big?: boolean;
}) {
  const link = useMemo(() => {
    if (!showLinks) return null;
    const m = new Map<string, PlotItem[]>();
    for (const it of items) (m.get(it.ramp) ?? m.set(it.ramp, []).get(it.ramp)!).push(it);
    return [...m.values()]
      .filter((g) => g.length > 1)
      .map((g) => g.map((it) => project(it.pt, mode)));
  }, [items, mode, showLinks]);

  return (
    <figure className={`plot ${big ? "big" : ""}`}>
      <svg viewBox={`0 0 ${S} ${S}`} className="plot-svg" preserveAspectRatio="xMidYMid meet">
        <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="var(--panel)" stroke="var(--border)" />
        {mode === "ab" && (
          <>
            <line x1={S / 2} y1={PAD} x2={S / 2} y2={S - PAD} stroke="var(--border-soft)" />
            <line x1={PAD} y1={S / 2} x2={S - PAD} y2={S / 2} stroke="var(--border-soft)" />
          </>
        )}
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
          const { px, py } = project(it.pt, mode);
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
