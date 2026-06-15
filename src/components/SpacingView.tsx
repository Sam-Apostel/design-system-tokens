import { useMemo } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { resolve } from "../lib/value";
import { spacingKind, lengthToPx, SPACING_KIND_ORDER, SPACING_KIND_LABEL, type SpacingKind } from "../lib/spacing";
import { lint, issuesByToken } from "../lib/lint";
import { SizePreview } from "./SizePreview";
import type { Token } from "../types";

interface Item {
  token: Token;
  raw: string | null;
  px: number | null;
}

export function SpacingView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => issuesByToken(lint(tokens)), [tokens]);

  const byKind = useMemo(() => {
    const m = new Map<SpacingKind, Item[]>();
    for (const t of tokens) {
      if (t.category !== "spacing") continue;
      const r = resolve(t, byName);
      const item: Item = { token: t, raw: r.finalRaw, px: lengthToPx(r.finalRaw) };
      const k = spacingKind(t.name);
      (m.get(k) ?? m.set(k, []).get(k)!).push(item);
    }
    for (const items of m.values()) items.sort((a, b) => (a.px ?? 1e9) - (b.px ?? 1e9));
    return m;
  }, [tokens, byName]);

  const kinds = SPACING_KIND_ORDER.filter((k) => byKind.has(k));

  if (kinds.length === 0) {
    return <div className="empty">No spacing / sizing tokens detected.</div>;
  }

  return (
    <div>
      <div className="section-title">Spacing &amp; sizing</div>
      {kinds.map((kind) => {
        const items = byKind.get(kind)!;
        const maxPx = Math.max(...items.map((i) => i.px ?? 0), 1);
        return (
          <div className="card" key={kind}>
            <div className="section-title">
              {SPACING_KIND_LABEL[kind]} <span className="count">({items.length})</span>
            </div>
            <div className={`viz-grid ${kind === "radius" || kind === "height" ? "viz-tiles" : ""}`}>
              {items.map(({ token, raw, px }) => {
                const sev = issues.get(token.name);
                return (
                  <div
                    className="viz-item"
                    key={token.id}
                    title={`--${token.name}`}
                    onClick={() => navigate("tokens", token.name)}
                  >
                    <div className="viz-preview">
                      <SizePreview kind={kind} px={px} maxPx={maxPx} />
                    </div>
                    <div className="viz-meta">
                      <span className="viz-name mono">
                        --{token.name}
                        {sev && <span className={`issue-dot ${sev}`} />}
                      </span>
                      <span className="viz-val mono faint">{raw ?? "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
