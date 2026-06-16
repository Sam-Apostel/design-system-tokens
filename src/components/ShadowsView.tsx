import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { lint, issuesByToken } from "../lib/lint";
import { shadowItems } from "../lib/shadows";

export function ShadowsView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);
  const [backdrop, setBackdrop] = useState<"light" | "dark">("light");

  const items = useMemo(() => shadowItems(tokens, byName), [tokens, byName]);
  // Count distinct resolved values — the real number of unique elevations.
  const distinct = useMemo(() => new Set(items.map((i) => i.css)).size, [items]);

  if (items.length === 0) {
    return (
      <div className="empty">
        No shadow or elevation tokens detected.
        <div className="hint" style={{ marginTop: 8 }}>
          Tokens named <span className="mono">shadow-*</span> / <span className="mono">elevation-*</span> or
          holding a <span className="mono">box-shadow</span> value (offsets + blur + color) show up here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">
        Shadows &amp; elevation <span className="count">({items.length})</span>
        <div className="spacer" />
        <div className="seg" title="Preview backdrop">
          <button className={backdrop === "light" ? "active" : ""} onClick={() => setBackdrop("light")}>Light</button>
          <button className={backdrop === "dark" ? "active" : ""} onClick={() => setBackdrop("dark")}>Dark</button>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Each token rendered as a real <span className="mono">box-shadow</span>, ordered shallow → deep
        ({distinct} distinct value{distinct === 1 ? "" : "s"}; the rest alias them). Shadows read best on the
        backdrop they're designed for — toggle above. Click a tile to open the token.
      </p>

      <div className={`shadow-grid backdrop-${backdrop}`}>
        {items.map((it) => {
          const sev = issues.get(it.token.name);
          return (
            <button
              className="shadow-cell"
              key={it.token.id}
              onClick={() => navigate("tokens", it.token.name)}
              title={it.css}
            >
              <div className="shadow-tile" style={{ boxShadow: it.css }} />
              <div className="shadow-meta">
                <span className="shadow-name mono">
                  --{it.token.name}
                  {sev && <span className={`issue-dot ${sev}`} />}
                </span>
                <span className="shadow-tags">
                  {it.ref && <span className="shadow-tag">→ {it.ref}</span>}
                  {it.inset && <span className="shadow-tag">inset</span>}
                  {it.layers > 1 && <span className="shadow-tag">{it.layers} layers</span>}
                </span>
                <span className="shadow-val mono faint">{it.css}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
