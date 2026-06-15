import { useMemo } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, contrastRatio, rateContrast, type RGB } from "../lib/color";

interface ColorEntry {
  name: string;
  rgb: RGB;
}

/**
 * Contrast matrix: every color token (as text/foreground) measured against a
 * set of background candidates (surface/bg tokens plus pure white & black).
 */
export function ContrastView() {
  const { tokens, byName } = useStore();

  const colors = useMemo<ColorEntry[]>(() => {
    const out: ColorEntry[] = [];
    for (const t of tokens) {
      if (t.category !== "color") continue;
      const rgb = parseColor(resolve(t, byName).finalRaw ?? "");
      if (rgb) out.push({ name: t.name, rgb });
    }
    return out;
  }, [tokens, byName]);

  const backgrounds = useMemo<ColorEntry[]>(() => {
    const bgLike = colors.filter((c) => /(bg|background|surface|base|canvas|paper)/i.test(c.name));
    const list: ColorEntry[] = [
      { name: "white", rgb: { r: 1, g: 1, b: 1, a: 1 } },
      { name: "black", rgb: { r: 0, g: 0, b: 0, a: 1 } },
      ...bgLike,
    ];
    // De-dupe by name.
    const seen = new Set<string>();
    return list.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
  }, [colors]);

  if (colors.length === 0) {
    return <div className="empty">No color tokens to evaluate.</div>;
  }

  return (
    <div>
      <div className="section-title">
        Contrast matrix <span className="count">(WCAG 2.1)</span>
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>
        Each cell is the contrast ratio of a color (row, used as text) on a background (column).
        A green outline marks AAA (≥ 7). Hover for the AA/AAA verdict.
      </p>
      <div style={{ overflow: "auto" }}>
        <table className="contrast-grid">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>text \ bg</th>
              {backgrounds.map((bg) => (
                <th className="col" key={bg.name} title={bg.name}>
                  --{bg.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((fg) => (
              <tr key={fg.name}>
                <th style={{ textAlign: "left", whiteSpace: "nowrap" }}>--{fg.name}</th>
                {backgrounds.map((bg) => {
                  const ratio = contrastRatio(fg.rgb, bg.rgb);
                  const rating = rateContrast(fg.rgb, bg.rgb);
                  return (
                    <td key={bg.name}>
                      <div
                        className={`contrast-cell ${rating.aaaNormal ? "pass-aaa" : ""}`}
                        style={{
                          background: toCssDisplay(bg.rgb),
                          color: toCssDisplay(fg.rgb),
                          opacity: rating.aaLargeOrAaaNormal ? 1 : 0.55,
                        }}
                        title={`--${fg.name} on --${bg.name}: ${ratio.toFixed(2)} — ${rating.label}`}
                      >
                        {ratio.toFixed(1)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
