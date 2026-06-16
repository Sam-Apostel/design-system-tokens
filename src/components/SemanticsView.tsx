import { useMemo } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { countByTier, tierMap, TIER_LABEL, TIER_BLURB, TIERS, type Tier } from "../lib/tiers";
import { coverageByGroup, type RecItem } from "../lib/recommendations";
import { resolve } from "../lib/value";
import { parseColor, toCssDisplay } from "../lib/color";

export function SemanticsView({
  onCreate,
  onOpenDocs,
}: {
  onCreate: (item: RecItem) => void;
  onOpenDocs: () => void;
}) {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();

  const counts = useMemo(() => countByTier(tokens), [tokens]);
  const groups = useMemo(() => coverageByGroup(tokens), [tokens]);
  const examples = useMemo(() => {
    const tiers = tierMap(tokens);
    const m: Record<Tier, string[]> = { primitive: [], semantic: [], component: [] };
    for (const t of tokens) {
      const tier = tiers.get(t.name) ?? "semantic";
      if (m[tier].length < 6) m[tier].push(t.name);
    }
    return m;
  }, [tokens]);

  const totalPresent = groups.reduce((a, g) => a + g.present, 0);
  const total = groups.reduce((a, g) => a + g.total, 0);

  const swatch = (name: string) => {
    const t = byName.get(name);
    if (!t) return null;
    const rgb = parseColor(resolve(t, byName).finalRaw ?? "");
    return rgb ? <span className="mini-swatch" style={{ background: toCssDisplay(rgb) }} /> : null;
  };

  return (
    <div>
      <div className="section-title">
        Semantics &amp; components
        <div className="spacer" />
        <button className="btn small" onClick={onOpenDocs}>Token guide</button>
      </div>

      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          A token system works in tiers: <b>primitives</b> hold raw values, <b>semantic</b> tokens give
          them meaning by referencing primitives, and <b>component</b> tokens reference semantics. Product
          code should use semantic &amp; component tokens — never raw primitives. Below is your current
          coverage and what's worth adding.
        </p>
      </div>

      {/* Tier overview */}
      <div className="tier-overview">
        {TIERS.map((tier, i) => (
          <div className="tier-col" key={tier}>
            <div className="tier-head">
              <span className="tier-name">{TIER_LABEL[tier]}</span>
              <span className="tier-count">{counts[tier]}</span>
            </div>
            <p className="hint" style={{ margin: "4px 0 8px" }}>{TIER_BLURB[tier]}</p>
            <div className="tier-chips">
              {examples[tier].length === 0 ? (
                <span className="faint mono">none yet</span>
              ) : (
                examples[tier].map((n) => (
                  <button key={n} className="chip-btn mono" onClick={() => navigate(tier === "primitive" ? "palette" : "tokens", n)}>
                    {swatch(n)}--{n}
                  </button>
                ))
              )}
            </div>
            {i < TIERS.length - 1 && <div className="tier-arrow">→</div>}
          </div>
        ))}
      </div>

      {/* Coverage */}
      <div className="section-title" style={{ marginTop: 24 }}>
        Recommended coverage <span className="count">({totalPresent}/{total})</span>
      </div>

      {groups.map((g) => (
        <div className="card" key={g.group}>
          <div className="section-title">
            {g.group}
            <span className="count">({g.present}/{g.total})</span>
          </div>
          <div className="cov-grid">
            {g.items.map(({ item, present, matches }) => (
              <div className={`cov-item ${present ? "present" : "missing"}`} key={item.key}>
                <div className="cov-status">{present ? "✓" : "+"}</div>
                <div className="cov-body">
                  <div className="cov-key mono">
                    {present ? (
                      <button className="chip-btn mono" onClick={() => navigate(item.kind === "color" ? "palette" : "tokens", matches[0])}>
                        {item.kind === "color" && swatch(matches[0])}
                        --{matches[0]}
                      </button>
                    ) : (
                      <>--{item.key}</>
                    )}
                  </div>
                  <div className="cov-desc faint">{item.desc}</div>
                </div>
                {!present && (
                  <button className="btn small" onClick={() => onCreate(item)}>
                    Create
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
