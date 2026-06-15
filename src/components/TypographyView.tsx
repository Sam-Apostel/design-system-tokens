import { useStore } from "../store";
import { resolve } from "../lib/value";

const SIZE_RE = /^-?[\d.]+(px|rem|em)$/i;

/** Preview typography tokens: render font sizes/families/weights as live text. */
export function TypographyView() {
  const { tokens, byName } = useStore();
  const typo = tokens
    .filter((t) => t.category === "typography")
    .map((t) => ({ token: t, raw: resolve(t, byName).finalRaw }));

  if (typo.length === 0) {
    return <div className="empty">No typography tokens detected.</div>;
  }

  const families = typo.filter((t) => t.raw && /,/.test(t.raw) && /[a-z]/i.test(t.raw));
  const sizes = typo.filter((t) => t.raw && SIZE_RE.test(t.raw.trim()));
  const weights = typo.filter((t) => t.raw && /^\d{2,3}$/.test(t.raw.trim()));
  const others = typo.filter((t) => !families.includes(t) && !sizes.includes(t) && !weights.includes(t));

  return (
    <div>
      <div className="section-title">
        Typography <span className="count">({typo.length})</span>
      </div>

      {families.length > 0 && (
        <div className="card">
          <div className="section-title">Font families</div>
          {families.map(({ token, raw }) => (
            <div className="type-sample" key={token.id}>
              <div className="lbl">
                <span>--{token.name}</span>
                <span className="muted">{raw}</span>
              </div>
              <div style={{ fontFamily: raw ?? undefined, fontSize: 22 }}>
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
          ))}
        </div>
      )}

      {sizes.length > 0 && (
        <div className="card">
          <div className="section-title">Font sizes</div>
          {sizes.map(({ token, raw }) => (
            <div className="type-sample" key={token.id}>
              <div className="lbl">
                <span>--{token.name}</span>
                <span className="muted">{raw}</span>
              </div>
              <div style={{ fontSize: raw ?? undefined, lineHeight: 1.2 }}>
                Aa Bb Cc — Sample text
              </div>
            </div>
          ))}
        </div>
      )}

      {weights.length > 0 && (
        <div className="card">
          <div className="section-title">Font weights</div>
          {weights.map(({ token, raw }) => (
            <div className="type-sample" key={token.id}>
              <div className="lbl">
                <span>--{token.name}</span>
                <span className="muted">{raw}</span>
              </div>
              <div style={{ fontWeight: raw ? Number(raw) : undefined, fontSize: 22 }}>
                The quick brown fox
              </div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="card">
          <div className="section-title">Other type tokens</div>
          {others.map(({ token, raw }) => (
            <div className="spacing-row" key={token.id}>
              <span className="mono">--{token.name}</span>
              <span className="mono muted">{raw ?? "—"}</span>
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
