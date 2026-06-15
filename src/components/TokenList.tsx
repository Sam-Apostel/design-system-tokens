import { useMemo, useState } from "react";
import type { Token, TokenCategory } from "../types";
import { useStore } from "../store";
import { resolve, valueToText } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";
import { topGroupOf } from "../lib/groups";
import { TokenEditor } from "./TokenEditor";

interface Props {
  /** Restrict to a category, or show everything. */
  category?: TokenCategory;
  title: string;
}

/** Browsable, editable list of tokens grouped by their top-level segment. */
export function TokenList({ category, title }: Props) {
  const { tokens, byName, dispatch } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tokens
      .filter((t) => (category ? t.category === category : true))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.order - b.order);
  }, [tokens, category, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Token[]>();
    for (const t of filtered) {
      const g = topGroupOf(t.name);
      (m.get(g) ?? m.set(g, []).get(g)!).push(t);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <div>
      <div className="section-title">
        {title}
        <span className="count">({filtered.length})</span>
        <div className="spacer" />
        <button
          className="btn small"
          onClick={() => {
            const seed =
              category === "color"
                ? "#888888"
                : category === "spacing"
                  ? "8px"
                  : category === "typography"
                    ? "16px"
                    : "";
            dispatch({ type: "add", name: `${category ?? "token"}-new`, raw: seed });
          }}
        >
          + Add
        </button>
      </div>

      <input
        className="search field"
        placeholder="Filter by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "8px 10px",
        }}
        spellCheck={false}
      />

      {groups.length === 0 && <div className="empty">No tokens here yet.</div>}

      {groups.map(([g, list]) => (
        <div className="token-group" key={g}>
          <h4>{g}</h4>
          {list.map((t) => {
            const r = resolve(t, byName);
            const rgb = r.finalRaw ? parseColor(r.finalRaw) : null;
            const isRef = t.value.kind === "ref";
            return (
              <div key={t.id}>
                <div
                  className={`row ${editing === t.id ? "selected" : ""}`}
                  onClick={() => setEditing(editing === t.id ? null : t.id)}
                >
                  {rgb ? (
                    <span className="swatch">
                      <i style={{ background: toCssDisplay(rgb) }} />
                    </span>
                  ) : (
                    <span className="swatch" style={{ background: "transparent" }} />
                  )}
                  <span className="name" title={t.name}>
                    --{t.name}
                  </span>
                  <span className={`val ${isRef ? "ref" : ""}`} title={valueToText(t.value)}>
                    {valueToText(t.value)}
                  </span>
                </div>
                {editing === t.id && (
                  <TokenEditor token={t} onClose={() => setEditing(null)} />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
