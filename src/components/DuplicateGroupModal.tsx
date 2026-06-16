import { useMemo, useState } from "react";
import type { Token } from "../types";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, rgbToOklch, shiftColor, toHex } from "../lib/color";
import { hueName } from "../lib/scale";
import { useEscapeClose } from "../lib/useEscapeClose";

/**
 * Clone a whole group/ramp under a new prefix. For color ramps you can rotate
 * hue and shift lightness so a finished blue scale becomes a matching teal or
 * green in one step, keeping the same perceptual lightness structure.
 */
export function DuplicateGroupModal({
  prefix,
  tokens,
  onClose,
}: {
  prefix: string;
  tokens: Token[];
  onClose: () => void;
}) {
  const { tokens: all, byName, dispatch } = useStore();
  useEscapeClose(onClose);

  // Resolve each group token to a color (if any) for preview + hue suggestion.
  const colors = useMemo(
    () =>
      tokens
        .map((t) => {
          const raw = resolve(t, byName).finalRaw;
          const rgb = raw ? parseColor(raw) : null;
          return rgb ? { name: t.name, rgb } : null;
        })
        .filter((x): x is { name: string; rgb: NonNullable<ReturnType<typeof parseColor>> } => !!x),
    [tokens, byName],
  );
  const isColor = colors.length > 0;
  const baseHue = isColor ? rgbToOklch(colors[Math.floor(colors.length / 2)].rgb).h : 0;

  const [hueShift, setHueShift] = useState(0);
  const [lightShift, setLightShift] = useState(0);
  const [edited, setEdited] = useState(false);

  // Suggest a hue-derived prefix (color-blue → color-teal) until the user types.
  const suggested = useMemo(() => {
    if (isColor && /^color-/.test(prefix) && hueShift) {
      return `color-${hueName(baseHue + hueShift)}`;
    }
    return `${prefix}-copy`;
  }, [isColor, prefix, hueShift, baseHue]);
  const [name, setName] = useState(suggested);
  const newPrefix = edited ? name : suggested;

  const existing = new Set(all.map((t) => t.name));
  const remap = (n: string) => (n === prefix ? newPrefix : newPrefix + n.slice(prefix.length));
  const newCount = tokens.filter((t) => !existing.has(remap(t.name))).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(640px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Duplicate <span className="mono" style={{ fontSize: 13 }}>--{prefix}-*</span></h3>
        </header>
        <div className="body gen-body">
          <div className="field">
            <label>New prefix</label>
            <input
              className="text-input"
              value={newPrefix}
              spellCheck={false}
              onChange={(e) => { setName(e.target.value); setEdited(true); }}
            />
          </div>

          {isColor && (
            <>
              <div className="gen-controls" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="field">
                  <label>Hue shift · {hueShift > 0 ? "+" : ""}{hueShift}°</label>
                  <input type="range" min={-180} max={180} step={1} value={hueShift} onChange={(e) => setHueShift(Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Lightness · {lightShift > 0 ? "+" : ""}{Math.round(lightShift * 100)}%</label>
                  <input type="range" min={-0.25} max={0.25} step={0.01} value={lightShift} onChange={(e) => setLightShift(Number(e.target.value))} />
                </div>
              </div>

              <div className="dup-preview">
                {colors.map((c) => {
                  const before = toHex({ ...c.rgb, a: 1 });
                  const after = shiftColor(before, hueShift, lightShift) ?? before;
                  return (
                    <div key={c.name} className="dup-pair" title={remap(c.name)}>
                      <span className="dup-chip" style={{ background: before }} />
                      <span className="dup-arrow">→</span>
                      <span className="dup-chip" style={{ background: after }} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <footer>
          <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>
            {newCount} token{newCount === 1 ? "" : "s"} → <span className="mono">--{newPrefix}-*</span>
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!newPrefix.trim() || newPrefix === prefix || newCount === 0}
            onClick={() => {
              dispatch({ type: "duplicateGroup", prefix, newPrefix, hueShift, lightShift });
              onClose();
            }}
          >
            Duplicate {newCount}
          </button>
        </footer>
      </div>
    </div>
  );
}
