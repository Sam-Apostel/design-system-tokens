import { useMemo, useState } from "react";
import { useStore } from "../store";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay, contrastRatio, rateContrast, type RGB } from "../lib/color";
import { semanticPairings } from "../lib/contrastAudit";

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
  const [metric, setMetric] = useState<"wcag" | "apca">("wcag");
  const sim = (c: RGB) => toCssDisplay(c);

  const semantic = useMemo(() => semanticPairings(tokens, byName), [tokens, byName]);
  const sortedPairs = useMemo(
    () => [...semantic.pairs].sort((a, b) => a.wcag - b.wcag),
    [semantic],
  );

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
      {/* Semantic pairings: text tokens on surface tokens */}
      {semantic.pairs.length > 0 && (
        <div className="card">
          <div className="section-title">
            Semantic pairings
            <span className="count">({semantic.texts.length} text × {semantic.surfaces.length} surface)</span>
            <div className="spacer" />
            <div className="seg">
              <button className={metric === "wcag" ? "active" : ""} onClick={() => setMetric("wcag")}>WCAG</button>
              <button className={metric === "apca" ? "active" : ""} onClick={() => setMetric("apca")}>APCA</button>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            Every <b>text</b> token measured on every <b>surface</b> token, worst-first.{" "}
            {metric === "wcag"
              ? "WCAG AA needs 4.5:1 for normal text, 3:1 for large."
              : "APCA Lc ≥ 60 suits body text, ≥ 45 large text (sign shows polarity)."}
          </p>
          <div className="pairing-grid">
            {sortedPairs.map((p) => {
              const ok = metric === "wcag" ? p.wcag >= 4.5 : Math.abs(p.apca) >= 60;
              const okLarge = metric === "wcag" ? p.wcag >= 3 : Math.abs(p.apca) >= 45;
              const score = metric === "wcag" ? `${p.wcag.toFixed(2)}:1` : `Lc ${Math.round(p.apca)}`;
              const status = ok ? "pass" : okLarge ? "large" : "fail";
              return (
                <div className={`pairing ${status}`} key={`${p.text.name}|${p.surface.name}`}>
                  <span className="pairing-chip" style={{ background: sim(p.surface.rgb), color: sim(p.text.rgb) }}>
                    Ag
                  </span>
                  <div className="pairing-meta">
                    <div className="mono pairing-names">
                      <span>--{p.text.name}</span>
                      <span className="faint"> on </span>
                      <span>--{p.surface.name}</span>
                    </div>
                    <div className="mono pairing-score">
                      {score} · <span className={`pairing-tag ${status}`}>{status === "pass" ? "OK" : status === "large" ? "large only" : "fail"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                          background: sim(bg.rgb),
                          color: sim(fg.rgb),
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
