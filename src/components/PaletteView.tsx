import { useMemo } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, toHex, rgbToOklab } from "../lib/color";
import { buildRamps, stepOf } from "../lib/groups";
import { unusedBaseColors, isAlias } from "../lib/relations";
import { lint, issuesByToken } from "../lib/lint";
import type { Token } from "../types";

export function PaletteView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();

  const colors = tokens.filter((t) => t.category === "color");
  const base = colors.filter((t) => !isAlias(t));
  const semantic = colors.filter((t) => isAlias(t));
  const unused = useMemo(() => unusedBaseColors(tokens), [tokens]);
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);

  if (colors.length === 0) {
    return <div className="empty">No color tokens detected. Import some CSS to begin.</div>;
  }

  const baseRamps = buildRamps(base);
  const semanticRamps = buildRamps(semantic);

  const Swatch = ({ t }: { t: Token }) => {
    const r = resolve(t, byName);
    const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
    const ok = rgb ? rgbToOklab(rgb) : null;
    const sev = issues.get(t.name);
    const isUnused = unused.has(t.name);
    return (
      <div
        className={`swatch-card ${isUnused ? "unused" : ""}`}
        title={`--${t.name}${isUnused ? " · not used by any semantic token" : ""}`}
        onClick={() => navigate("colorspace", t.name)}
      >
        <div className="chip" style={{ background: rgb ? toCssDisplay(rgb) : "#000" }}>
          {isAlias(t) && <span className="alias">alias</span>}
          {isUnused && <span className="unused-tag">unused</span>}
          {sev && <span className={`chip-dot ${sev}`} />}
        </div>
        <div className="meta">
          <div className="s">{stepOf(t.name)}</div>
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
          Raw color values. Dimmed swatches marked <b>unused</b> aren't referenced by any token in the
          semantic layer below.
        </p>
        {baseRamps.map((ramp) => (
          <div className="ramp" key={ramp.key}>
            <h4>{ramp.key}</h4>
            <div className="swatches">
              {ramp.tokens.map((t) => (
                <Swatch key={t.id} t={t} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="layer-divider">
        <span>applied to ↓</span>
      </div>

      <div className="layer-section">
        <div className="section-title">
          Semantic layer
          <span className="count">({semantic.length} aliases)</span>
        </div>
        <p className="hint" style={{ marginTop: -4 }}>
          Tokens that reference the base palette via <span className="mono">var(--…)</span>. These are
          what product code should consume.
        </p>
        {semantic.length === 0 ? (
          <div className="empty">
            No semantic color tokens yet. Alias a base color (e.g.
            <span className="mono"> --color-brand: var(--colors-blue-500)</span>) to build your upper layer.
          </div>
        ) : (
          semanticRamps.map((ramp) => (
            <div className="ramp" key={ramp.key}>
              <h4>{ramp.key}</h4>
              <div className="swatches">
                {ramp.tokens.map((t) => (
                  <Swatch key={t.id} t={t} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
