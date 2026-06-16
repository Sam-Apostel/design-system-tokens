import { useMemo } from "react";
import type { Token } from "../types";
import { useStore } from "../store";
import { rateContrast, compositeOver, toHex, type RGB } from "../lib/color";
import { colorRoles, isSurfaceName } from "../lib/contrastAudit";

const WHITE: RGB = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGB = { r: 0, g: 0, b: 0, a: 1 };

/**
 * Live WCAG feedback while editing a color: shows the token paired with the
 * relevant surfaces (or texts, if it's a surface itself) so accessibility is
 * visible at the point of editing instead of only in the Contrast tab.
 */
export function ContrastInline({ token, rgb }: { token: Token; rgb: RGB }) {
  const { tokens, byName } = useStore();

  const pairs = useMemo(() => {
    const { texts, surfaces } = colorRoles(tokens, byName);
    const self = token.name;
    const surface = isSurfaceName(self);

    // Surface token → show the text colors over it. Otherwise treat the token
    // as a foreground and show it over the available surfaces (falling back to
    // white/black so primitives still get a reading).
    const refs = surface
      ? texts.filter((t) => t.name !== self).slice(0, 4)
      : (surfaces.length ? surfaces : [{ name: "white", rgb: WHITE }, { name: "black", rgb: BLACK }])
          .filter((s) => s.name !== self)
          .slice(0, 4);

    return refs.map((ref) => {
      const fg = surface ? ref.rgb : rgb;
      const bg = surface ? rgb : ref.rgb;
      return { label: ref.name, fg, bg, rating: rateContrast(fg, bg) };
    });
  }, [tokens, byName, token.name, rgb]);

  if (pairs.length === 0) return null;

  return (
    <div className="ci">
      <div className="ci-head">Contrast {isSurfaceName(token.name) ? "(text over this)" : "(over surfaces)"}</div>
      <div className="ci-row">
        {pairs.map((p) => {
          const cls = p.rating.aaaNormal ? "aaa" : p.rating.aaNormal ? "aa" : p.rating.aaLargeOrAaaNormal ? "large" : "fail";
          // Show what the eye actually sees: a translucent surface over the page,
          // and the text over that surface — same compositing the rating uses.
          const bgShown = compositeOver(p.bg, WHITE);
          const fgShown = compositeOver(p.fg, bgShown);
          return (
            <div key={p.label} className="ci-chip" title={`${p.label} — ${p.rating.ratio.toFixed(2)}:1 (${p.rating.label})`}>
              <span className="ci-sample" style={{ background: toHex(bgShown), color: toHex(fgShown) }}>Aa</span>
              <span className={`ci-score ${cls}`}>{p.rating.ratio.toFixed(1)}</span>
              <span className="ci-label mono">{p.label.replace(/^color-/, "")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
