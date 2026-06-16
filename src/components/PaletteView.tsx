import { useMemo } from "react";
import { useStore } from "../store";
import { useEditToken } from "../editToken";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, toHex, rgbToOklab } from "../lib/color";
import { buildRamps, stepOf } from "../lib/groups";
import { unusedBaseColors, isAlias } from "../lib/relations";
import { lint, issuesByToken } from "../lib/lint";
import type { Token } from "../types";

export function PaletteView() {
  const { tokens, byName } = useStore();
  const openEditor = useEditToken();

  // The palette shows the raw primitive ramps only — the source-of-truth colors.
  // Alias/semantic tokens live in the Semantics tab; mixing them here just made
  // the palette noisier (and is what the swatch step labels assume).
  const base = tokens.filter((t) => t.category === "color" && !isAlias(t));
  const unused = useMemo(() => unusedBaseColors(tokens), [tokens]);
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);

  if (base.length === 0) {
    return <div className="empty">No raw color tokens detected. Import some CSS to begin.</div>;
  }

  const baseRamps = buildRamps(base);

  const Swatch = ({ t, fullName }: { t: Token; fullName?: boolean }) => {
    const r = resolve(t, byName);
    const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
    const ok = rgb ? rgbToOklab(rgb) : null;
    const sev = issues.get(t.name);
    const isUnused = unused.has(t.name);
    return (
      <div
        className={`swatch-card ${isUnused ? "unused" : ""}`}
        title={`--${t.name}${isUnused ? " · not used by any semantic token" : ""} · click to edit`}
        onClick={() => openEditor(t.name)}
      >
        <div className="chip" style={{ background: rgb ? toCssDisplay(rgb) : "#000" }}>
          {isUnused && <span className="unused-tag">unused</span>}
          {sev && <span className={`chip-dot ${sev}`} />}
        </div>
        <div className="meta">
          <div className="s" title={t.name}>{fullName ? t.name : stepOf(t.name)}</div>
          <div className="v" title={rgb ? toHex(rgb) : "?"}>
            {rgb ? toHex(rgb) : "—"}
          </div>
          {ok && <div className="v faint">L {Math.round(ok.L * 100)}</div>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="layer-section">
        <div className="section-title">
          Base palette
          <span className="count">({base.length} primitives)</span>
          {unused.size > 0 && (
            <span className="pill warn-pill" title="Base colors not referenced by any semantic token">
              {unused.size} unused
            </span>
          )}
        </div>
        <p className="hint" style={{ marginTop: -4 }}>
          Raw color values — your primitive ramps. Dimmed swatches marked <b>unused</b> aren't referenced
          by any semantic (alias) token. Click a swatch to edit it.
        </p>
        {baseRamps.map((ramp) => (
          <div className={`ramp ${ramp.misc ? "ramp-misc" : ""}`} key={ramp.key}>
            <h4>{ramp.misc ? "other (one-offs)" : ramp.key}</h4>
            <div className="swatches">
              {ramp.tokens.map((t) => (
                <Swatch key={t.id} t={t} fullName={ramp.misc} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
