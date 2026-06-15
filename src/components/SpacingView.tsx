import { useStore } from "../store";
import { resolve } from "../lib/value";

/** Resolve a length token to pixels for visual comparison (best effort). */
function toPx(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?[\d.]+)(px|rem|em)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  if (unit === "rem" || unit === "em") return n * 16;
  return n;
}

export function SpacingView() {
  const { tokens, byName } = useStore();
  const items = tokens
    .filter((t) => t.category === "spacing")
    .map((t) => {
      const r = resolve(t, byName);
      return { token: t, raw: r.finalRaw, px: toPx(r.finalRaw) };
    })
    .sort((a, b) => (a.px ?? 1e9) - (b.px ?? 1e9));

  if (items.length === 0) {
    return <div className="empty">No spacing / sizing tokens detected.</div>;
  }

  const max = Math.max(...items.map((i) => i.px ?? 0), 1);

  return (
    <div>
      <div className="section-title">
        Spacing &amp; sizing <span className="count">({items.length})</span>
      </div>
      <div className="card">
        {items.map(({ token, raw, px }) => (
          <div className="spacing-row" key={token.id}>
            <span className="mono" title={token.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              --{token.name}
            </span>
            <span className="mono muted">{raw ?? "—"}</span>
            <span
              className="bar"
              style={{ width: px != null ? `${Math.max(2, (px / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
