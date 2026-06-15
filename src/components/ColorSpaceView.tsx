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

const SIZE = 460;
const PAD = 34;
const INNER = SIZE - PAD * 2;

interface PlotItem {
  token: Token;
  hex: string;
  css: string;
  pt: SpacePoint;
  ramp: string;
}

/** Map a SpacePoint to svg pixel coords for the active plot mode. */
function project(pt: SpacePoint, mode: PlotMode): { px: number; py: number } {
  if (mode === "ab") {
    // x,y are -1..1 with origin at center.
    return { px: PAD + ((pt.x + 1) / 2) * INNER, py: PAD + ((1 - pt.y) / 2) * INNER };
  }
  if (mode === "LC") {
    return { px: PAD + pt.chroma * INNER, py: PAD + (1 - pt.lightness) * INNER };
  }
  // LH: hue 0..360 across X, lightness up Y.
  const h = ((pt.hue % 360) + 360) % 360;
  return { px: PAD + (h / 360) * INNER, py: PAD + (1 - pt.lightness) * INNER };
}

export function ColorSpaceView() {
  const { tokens, byName } = useStore();
  const [space, setSpace] = useState<ColorSpace>("oklab");
  const [mode, setMode] = useState<PlotMode>("ab");
  const [showLinks, setShowLinks] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  const items = useMemo<PlotItem[]>(() => {
    const colors = tokens.filter((t) => t.category === "color");
    const rampKey = new Map<string, string>();
    for (const ramp of buildRamps(colors)) {
      for (const t of ramp.tokens) rampKey.set(t.id, ramp.key);
    }
    const out: PlotItem[] = [];
    for (const t of colors) {
      const r = resolve(t, byName);
      const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
      if (!rgb) continue;
      out.push({
        token: t,
        hex: toHex(rgb),
        css: toCssDisplay(rgb),
        pt: toSpacePoint(rgb, space),
        ramp: rampKey.get(t.id) ?? t.name,
      });
    }
    return out;
  }, [tokens, byName, space]);

  // Polylines per ramp (only ramps with 2+ resolvable colors).
  const links = useMemo(() => {
    if (!showLinks) return [];
    const m = new Map<string, PlotItem[]>();
    for (const it of items) (m.get(it.ramp) ?? m.set(it.ramp, []).get(it.ramp)!).push(it);
    return [...m.values()]
      .filter((g) => g.length > 1)
      .map((g) => g.map((it) => project(it.pt, mode)));
  }, [items, mode, showLinks]);

  const axisLabels = AXIS_LABELS[mode][space];

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
        <div className="plot-wrap">
          <svg width={SIZE} height={SIZE} style={{ background: "var(--panel)", borderRadius: 10, border: "1px solid var(--border-soft)" }}>
            {/* grid */}
            <rect x={PAD} y={PAD} width={INNER} height={INNER} fill="none" stroke="var(--border)" />
            {mode === "ab" && (
              <>
                <line x1={SIZE / 2} y1={PAD} x2={SIZE / 2} y2={SIZE - PAD} stroke="var(--border-soft)" />
                <line x1={PAD} y1={SIZE / 2} x2={SIZE - PAD} y2={SIZE / 2} stroke="var(--border-soft)" />
              </>
            )}
            <text x={SIZE / 2} y={SIZE - 8} textAnchor="middle" fontSize="11" fill="var(--text-faint)">
              {axisLabels.x}
            </text>
            <text x={12} y={SIZE / 2} textAnchor="middle" fontSize="11" fill="var(--text-faint)" transform={`rotate(-90 12 ${SIZE / 2})`}>
              {axisLabels.y}
            </text>

            {/* ramp connectors */}
            {links.map((pts, i) => (
              <polyline
                key={i}
                points={pts.map((p) => `${p.px},${p.py}`).join(" ")}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1.5}
              />
            ))}

            {/* points */}
            {items.map((it) => {
              const { px, py } = project(it.pt, mode);
              const active = hover === it.token.id;
              return (
                <g key={it.token.id} onMouseEnter={() => setHover(it.token.id)} onMouseLeave={() => setHover(null)}>
                  <circle
                    cx={px}
                    cy={py}
                    r={active ? 9 : 6}
                    fill={it.css}
                    stroke={active ? "#fff" : "rgba(0,0,0,0.5)"}
                    strokeWidth={active ? 2 : 1}
                  >
                    <title>{`--${it.token.name}\n${it.hex}`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>

          <div style={{ minWidth: 200, flex: 1 }}>
            <div className="card" style={{ marginBottom: 12 }}>
              <strong>{hover ? `--${items.find((i) => i.token.id === hover)?.token.name}` : "Hover a point"}</strong>
              <div className="muted mono" style={{ marginTop: 6 }}>
                {hover ? items.find((i) => i.token.id === hover)?.hex : "Each dot is a token, filled with its real color."}
              </div>
            </div>
            <p className="hint">
              Switch color space to see how the same colors relocate. Connected lines trace each ramp
              (e.g. <span className="mono">color-blue-*</span>) so you can spot uneven hue/lightness steps.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const AXIS_LABELS: Record<PlotMode, Record<ColorSpace, { x: string; y: string }>> = {
  ab: {
    oklab: { x: "a (green ↔ red)", y: "b (blue ↔ yellow)" },
    cielab: { x: "a* (green ↔ red)", y: "b* (blue ↔ yellow)" },
    hsl: { x: "saturation × cos(hue)", y: "saturation × sin(hue)" },
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
