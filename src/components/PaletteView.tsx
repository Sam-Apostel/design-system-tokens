import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, toHex, rgbToOklab } from "../lib/color";
import { buildRamps, stepOf } from "../lib/groups";

/** Swatch grid grouped into ramps, ordered by scale step. */
export function PaletteView() {
  const { tokens, byName } = useStore();
  const colors = tokens.filter((t) => t.category === "color");
  const ramps = buildRamps(colors);

  if (colors.length === 0) {
    return <div className="empty">No color tokens detected. Import some CSS to begin.</div>;
  }

  return (
    <div>
      <div className="section-title">
        Palette <span className="count">({colors.length} colors)</span>
      </div>
      {ramps.map((ramp) => (
        <div className="ramp" key={ramp.key}>
          <h4>{ramp.key}</h4>
          <div className="swatches">
            {ramp.tokens.map((t) => {
              const r = resolve(t, byName);
              const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
              const isRef = t.value.kind === "ref";
              const ok = rgb ? rgbToOklab(rgb) : null;
              return (
                <div className="swatch-card" key={t.id} title={`--${t.name}`}>
                  <div
                    className="chip"
                    style={{ background: rgb ? toCssDisplay(rgb) : "#000" }}
                  >
                    {isRef && <span className="alias">alias</span>}
                  </div>
                  <div className="meta">
                    <div className="s">{stepOf(t.name)}</div>
                    <div className="v" title={rgb ? toHex(rgb) : "?"}>
                      {rgb ? toHex(rgb) : "—"}
                    </div>
                    {ok && (
                      <div className="v faint">L {Math.round(ok.L * 100)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
