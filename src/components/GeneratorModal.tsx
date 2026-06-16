import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useEscapeClose } from "../lib/useEscapeClose";
import { toHex, parseColor } from "../lib/color";
import {
  generateColorRamp,
  generateNumericScale,
  suggestRampPrefix,
  SPACING_LABEL_PRESETS,
  TYPE_LABEL_PRESETS,
  RATIO_PRESETS,
  type ScaleMode,
  type ScaleUnit,
} from "../lib/scale";

type Kind = "color" | "spacing" | "type";

/**
 * Generate a whole token scale at once — the authoring counterpart to import.
 * Color ramps are computed in OKLCH for perceptual evenness; spacing/type use
 * modular or linear progressions. The live preview is the generated tokens.
 */
export function GeneratorModal({ onClose, initialKind = "color", initialSeed }: { onClose: () => void; initialKind?: Kind; initialSeed?: string }) {
  const { tokens, dispatch } = useStore();
  const [kind, setKind] = useState<Kind>(initialKind);
  useEscapeClose(onClose);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: "min(820px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Generate a scale</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <div className="seg">
            <button className={kind === "color" ? "active" : ""} onClick={() => setKind("color")}>Color ramp</button>
            <button className={kind === "spacing" ? "active" : ""} onClick={() => setKind("spacing")}>Spacing</button>
            <button className={kind === "type" ? "active" : ""} onClick={() => setKind("type")}>Type scale</button>
          </div>
        </header>
        {kind === "color" ? (
          <ColorRampForm
            existing={new Set(tokens.map((t) => t.name))}
            initialSeed={initialSeed}
            onCancel={onClose}
            onAdd={(items) => { dispatch({ type: "addMany", items }); onClose(); }}
          />
        ) : (
          <NumericForm
            kind={kind}
            existing={new Set(tokens.map((t) => t.name))}
            onCancel={onClose}
            onAdd={(items) => { dispatch({ type: "addMany", items }); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------- color ramp ------------------------------- */

function ColorRampForm({ existing, onAdd, onCancel, initialSeed }: { existing: Set<string>; onAdd: (items: { name: string; raw: string }[]) => void; onCancel: () => void; initialSeed?: string }) {
  const seed0 = initialSeed && parseColor(initialSeed) ? initialSeed : "#3b82f6";
  const [seed, setSeed] = useState(seed0);
  const [prefix, setPrefix] = useState(() => suggestRampPrefix(seed0));
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [steps, setSteps] = useState(10);
  const [chromaMult, setChromaMult] = useState(1);
  const [lightL, setLightL] = useState(0.97);
  const [darkL, setDarkL] = useState(0.22);

  const setSeedAndPrefix = (v: string) => {
    setSeed(v);
    if (!prefixTouched && parseColor(v)) setPrefix(suggestRampPrefix(v));
  };

  const ramp = useMemo(
    () => generateColorRamp({ seed, steps, chromaMult, lightLightness: lightL, darkLightness: darkL }),
    [seed, steps, chromaMult, lightL, darkL],
  );

  const names = ramp.map((s) => `${prefix}-${s.label}`);
  const collisions = names.filter((n) => existing.has(n)).length;
  const seedRgb = parseColor(seed);

  return (
    <>
      <div className="body gen-body">
        <div className="gen-controls">
          <div className="field">
            <label>Seed color</label>
            <div className="oklch-hex">
              <input className="text-input" value={seed} spellCheck={false} onChange={(e) => setSeedAndPrefix(e.target.value)} />
              <input type="color" aria-label="Seed color" value={seedRgb ? toHex({ ...seedRgb, a: 1 }) : "#3b82f6"} onChange={(e) => setSeedAndPrefix(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Name prefix</label>
            <input
              className="text-input"
              value={prefix}
              spellCheck={false}
              onChange={(e) => { setPrefix(e.target.value); setPrefixTouched(true); }}
            />
          </div>
          <div className="field">
            <label>Steps</label>
            <select className="text-input" value={steps} onChange={(e) => setSteps(Number(e.target.value))}>
              <option value={9}>100–900 (9)</option>
              <option value={10}>50–900 (10)</option>
              <option value={11}>50–950 (11)</option>
            </select>
          </div>
          <div className="field">
            <label>Chroma · {Math.round(chromaMult * 100)}%</label>
            <input type="range" min={0} max={1.5} step={0.05} value={chromaMult} onChange={(e) => setChromaMult(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Lightest · {Math.round(lightL * 100)}%</label>
            <input type="range" min={0.8} max={1} step={0.005} value={lightL} onChange={(e) => setLightL(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Darkest · {Math.round(darkL * 100)}%</label>
            <input type="range" min={0.08} max={0.45} step={0.005} value={darkL} onChange={(e) => setDarkL(Number(e.target.value))} />
          </div>
        </div>

        <div className="gen-ramp-preview">
          {ramp.map((s, i) => {
            const collide = existing.has(names[i]);
            return (
              <div key={s.label} className="gen-ramp-chip" title={collide ? "Name already exists — will be skipped" : names[i]}>
                <span className="gen-ramp-color" style={{ background: s.hex }}>
                  {collide && <span className="gen-dup">!</span>}
                </span>
                <span className="gen-ramp-step">{s.label}</span>
                <span className="gen-ramp-hex mono">{s.hex}</span>
                <span className="gen-ramp-l mono">L {Math.round(s.L * 100)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <footer>
        <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>
          {names.length - collisions} new primitive{names.length - collisions === 1 ? "" : "s"} → <span className="mono">--{prefix}-*</span>
          {collisions > 0 && <span className="faint"> · {collisions} existing skipped</span>}
        </span>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button
          className="btn primary"
          disabled={!prefix.trim() || names.length - collisions === 0}
          onClick={() => onAdd(ramp.map((s, i) => ({ name: names[i], raw: s.hex })))}
        >
          Add {names.length - collisions} tokens
        </button>
      </footer>
    </>
  );
}

/* ----------------------------- numeric scales ----------------------------- */

function NumericForm({
  kind,
  existing,
  onAdd,
  onCancel,
}: {
  kind: "spacing" | "type";
  existing: Set<string>;
  onAdd: (items: { name: string; raw: string }[]) => void;
  onCancel: () => void;
}) {
  const isType = kind === "type";
  const [prefix, setPrefix] = useState(isType ? "font-size" : "space");
  const [base, setBase] = useState(isType ? 16 : 4);
  const [unit, setUnit] = useState<ScaleUnit>("px");
  const [mode, setMode] = useState<ScaleMode>(isType ? "modular" : "linear");
  const [ratio, setRatio] = useState(isType ? 1.25 : 1.5);
  const [step, setStep] = useState(4);
  const [preset, setPreset] = useState(isType ? "t-shirt" : "t-shirt");

  const labels = (isType ? TYPE_LABEL_PRESETS : SPACING_LABEL_PRESETS)[preset];
  // Base label: "md"/"body" sit mid-scale; numeric/others anchor at the start.
  const baseIndex = isType ? Math.max(0, labels.indexOf("md")) : 0;

  const scale = useMemo(
    () => generateNumericScale({ base, ratio, step, mode, unit, labels, baseIndex }),
    [base, ratio, step, mode, unit, labels, baseIndex],
  );

  const names = labels.map((l) => `${prefix}-${l}`);
  const collisions = names.filter((n) => existing.has(n)).length;
  const maxPx = Math.max(...scale.map((s) => s.px), 1);
  const presets = isType ? TYPE_LABEL_PRESETS : SPACING_LABEL_PRESETS;

  return (
    <>
      <div className="body gen-body">
        <div className="gen-controls">
          <div className="field">
            <label>Name prefix</label>
            <input className="text-input" value={prefix} spellCheck={false} onChange={(e) => setPrefix(e.target.value)} />
          </div>
          <div className="field">
            <label>Base size</label>
            <div className="oklch-hex">
              <input className="text-input" type="number" min={1} step={isType ? 1 : 1} value={base} onChange={(e) => setBase(Number(e.target.value))} />
              <select className="text-input" style={{ maxWidth: 80 }} value={unit} onChange={(e) => setUnit(e.target.value as ScaleUnit)}>
                <option value="px">px</option>
                <option value="rem">rem</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Naming</label>
            <select className="text-input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.keys(presets).map((k) => (
                <option key={k} value={k}>{k} ({presets[k].length})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Progression</label>
            <div className="seg" style={{ width: "fit-content" }}>
              <button className={mode === "modular" ? "active" : ""} onClick={() => setMode("modular")}>Modular</button>
              <button className={mode === "linear" ? "active" : ""} onClick={() => setMode("linear")}>Linear</button>
            </div>
          </div>
          {mode === "modular" ? (
            <div className="field">
              <label>Ratio</label>
              <select className="text-input" value={ratio} onChange={(e) => setRatio(Number(e.target.value))}>
                {RATIO_PRESETS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Step (+{step}px each)</label>
              <input type="range" min={1} max={16} step={1} value={step} onChange={(e) => setStep(Number(e.target.value))} />
            </div>
          )}
        </div>

        <div className="gen-num-preview">
          {scale.map((s, i) => {
            const collide = existing.has(names[i]);
            return (
              <div key={s.label} className={`gen-num-row ${collide ? "dup" : ""}`}>
                <span className="gen-num-label mono">{names[i]}</span>
                <span className="gen-num-val mono">{s.value}</span>
                <span className="gen-num-bar-wrap">
                  <span
                    className="gen-num-bar"
                    style={{
                      width: `${Math.max(2, (s.px / maxPx) * 100)}%`,
                      ...(isType ? { fontSize: Math.min(s.px, 34) } : {}),
                    }}
                  >
                    {isType ? "Ag" : ""}
                  </span>
                </span>
                {collide && <span className="gen-dup-tag">exists</span>}
              </div>
            );
          })}
        </div>
      </div>
      <footer>
        <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>
          {names.length - collisions} new token{names.length - collisions === 1 ? "" : "s"} → <span className="mono">--{prefix}-*</span>
          {collisions > 0 && <span className="faint"> · {collisions} existing skipped</span>}
        </span>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button
          className="btn primary"
          disabled={!prefix.trim() || names.length - collisions === 0}
          onClick={() => onAdd(scale.map((s, i) => ({ name: names[i], raw: s.value })))}
        >
          Add {names.length - collisions} tokens
        </button>
      </footer>
    </>
  );
}
