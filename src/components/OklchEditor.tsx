import { useEffect, useState } from "react";
import {
  parseColor,
  rgbToOklch,
  oklchToHex,
  oklchInGamut,
  maxChroma,
  toHex,
} from "../lib/color";

/**
 * Perceptual color editor: OKLCH lightness / chroma / hue sliders plus a hex
 * field. The whole app reasons in OKLCH (the color-space plots, ramp metrics),
 * so editing in the same space lets you nudge one perceptual axis at a time —
 * e.g. brighten without shifting hue — which a native RGB picker can't do.
 *
 * Values are written back as hex so tokens stay portable; alpha is preserved.
 */
export function OklchEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) {
  const parsed = parseColor(value);
  const initial = parsed ?? { r: 0.5, g: 0.5, b: 0.5, a: 1 };
  const a = initial.a;
  const o = rgbToOklch(initial);

  // OKLCH is the interaction source of truth so dragging stays smooth (writing
  // hex out and re-deriving would jitter from rounding/gamut clamping).
  const [L, setL] = useState(o.L);
  const [C, setC] = useState(o.C);
  const [h, setH] = useState(o.h);
  const [hexText, setHexText] = useState(toHex(initial));
  const [hexFocused, setHexFocused] = useState(false);

  // Re-sync when the *external* value changes (different token, alias unlink,
  // generator), but ignore our own writes (which already match) and don't clobber
  // the hex field while the user is mid-edit in it.
  useEffect(() => {
    const p = parseColor(value);
    if (!p) return;
    if (oklchToHex(L, C, h, a).toLowerCase() === toHex(p).toLowerCase()) return;
    const next = rgbToOklch(p);
    setL(next.L);
    setC(next.C);
    setH(next.h);
    if (!hexFocused) setHexText(toHex(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const push = (nl: number, nc: number, nh: number) => {
    const hex = oklchToHex(nl, nc, nh, a);
    setHexText(hex);
    onChange(hex);
  };

  const onL = (v: number) => { setL(v); push(v, C, h); };
  const onC = (v: number) => { setC(v); push(L, v, h); };
  const onH = (v: number) => { setH(v); push(L, C, v); };

  // `keepAlpha` re-applies the token's existing alpha for inputs that can't
  // express it (the native color picker and eyedropper only emit opaque hex),
  // so editing via them no longer silently drops transparency.
  const commitHex = (text: string, keepAlpha = false): boolean => {
    const p = parseColor(text.trim());
    if (!p) return false;
    const out = keepAlpha ? { ...p, a } : p;
    const next = rgbToOklch(out);
    setL(next.L);
    setC(next.C);
    setH(next.h);
    setHexText(toHex(out));
    onChange(toHex(out));
    return true;
  };

  // Gradient tracks: sample the axis being dragged at the current other two.
  const stops = (fn: (t: number) => string, n = 10) =>
    Array.from({ length: n + 1 }, (_, i) => fn(i / n)).join(", ");
  const lTrack = `linear-gradient(90deg, ${stops((t) => oklchToHex(t, C, h))})`;
  const cTrack = `linear-gradient(90deg, ${stops((t) => oklchToHex(L, t * 0.4, h))})`;
  const hTrack = `linear-gradient(90deg, ${stops((t) => oklchToHex(L, Math.max(C, 0.1), t * 360), 18)})`;

  const cMax = maxChroma(L, h);
  const clamped = !oklchInGamut(L, C, h);
  const swatch = oklchToHex(L, C, h, a);

  const pickEyedropper = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!ED) return;
    try {
      const res = await new ED().open();
      commitHex(res.sRGBHex, true);
    } catch {
      /* user cancelled */
    }
  };

  const hasEyedropper =
    typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="oklch">
      <div className="oklch-swatch" style={{ background: swatch }}>
        {clamped && <span className="oklch-clamp" title="Clipped to the sRGB gamut">out of gamut</span>}
      </div>

      <Slider label="L" sub="lightness" value={L} min={0} max={1} step={0.001}
        display={Math.round(L * 100) + "%"} track={lTrack} onChange={onL} />
      <Slider label="C" sub="chroma" value={C} min={0} max={0.4} step={0.001}
        display={C.toFixed(3)} track={cTrack} onChange={onC}
        marker={cMax < 0.4 ? cMax / 0.4 : undefined} />
      <Slider label="H" sub="hue" value={h} min={0} max={360} step={0.5}
        display={Math.round(h) + "°"} track={hTrack} onChange={onH} />

      <div className="oklch-hex">
        <input
          className="text-input"
          value={hexText}
          spellCheck={false}
          onFocus={() => setHexFocused(true)}
          onChange={(e) => setHexText(e.target.value)}
          onBlur={(e) => {
            setHexFocused(false);
            // Revert to the current valid color if the typed value won't parse,
            // so the field never sits showing an uncommitted/invalid string.
            if (!commitHex(e.target.value)) setHexText(oklchToHex(L, C, h, a));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const el = e.target as HTMLInputElement;
              if (!commitHex(el.value)) setHexText(oklchToHex(L, C, h, a));
              el.blur();
            }
          }}
        />
        <input
          type="color"
          aria-label="System color picker"
          value={oklchToHex(L, C, h)}
          onChange={(e) => commitHex(e.target.value, true)}
        />
        {hasEyedropper && (
          <button className="btn small" type="button" title="Pick a color from the screen" onClick={pickEyedropper}>
            ⊙
          </button>
        )}
      </div>
    </div>
  );
}

function Slider({
  label, sub, value, min, max, step, display, track, marker, onChange,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  track: string;
  marker?: number; // 0..1 position of an in-gamut limit marker
  onChange: (v: number) => void;
}) {
  return (
    <div className="oklch-slider">
      <div className="oklch-slider-head">
        <span className="oklch-axis"><b>{label}</b> {sub}</span>
        <span className="oklch-val mono">{display}</span>
      </div>
      <div className="oklch-track-wrap">
        <span className="oklch-track" style={{ background: track }} />
        {marker !== undefined && (
          <span className="oklch-marker" style={{ left: `${marker * 100}%` }} title="Max in-gamut chroma" />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
