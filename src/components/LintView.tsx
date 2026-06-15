import { useMemo } from "react";
import { useStore } from "../store";
import { useNav, type Tab } from "../nav";
import { lint, summarize, DEFAULT_LINT_CONFIG } from "../lib/lint";

const TAB_FOR_CATEGORY: Record<string, Tab> = {
  color: "palette",
  spacing: "spacing",
  typography: "typography",
  other: "tokens",
};

export function LintView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => lint(tokens, DEFAULT_LINT_CONFIG), [tokens]);
  const counts = summarize(issues);

  const targetFor = (tokenNames: string[]): { tab: Tab; token: string } | null => {
    const name = tokenNames[0];
    if (!name) return null;
    const t = byName.get(name);
    const tab = TAB_FOR_CATEGORY[t?.category ?? "other"] ?? "tokens";
    return { tab, token: name };
  };

  return (
    <div>
      <div className="section-title">Checks &amp; conventions</div>

      <div className="pill-summary">
        <span className="pill"><span className="sev error">err</span> <b>{counts.error}</b></span>
        <span className="pill"><span className="sev warning">warn</span> <b>{counts.warning}</b></span>
        <span className="pill"><span className="sev info">info</span> <b>{counts.info}</b></span>
      </div>

      {issues.length === 0 ? (
        <div className="empty">✓ No issues found. Tidy token set!</div>
      ) : (
        issues.map((i) => {
          const target = targetFor(i.tokens);
          return (
            <div
              className={`issue ${target ? "clickable" : ""}`}
              key={i.id}
              onClick={() => target && navigate(target.tab, target.token)}
              title={target ? `Go to ${target.tab} → --${target.token}` : undefined}
            >
              <span className={`sev ${i.severity}`}>{i.severity}</span>
              <div className="body">
                <div className="rule">{i.rule}</div>
                <div className="msg">{i.message}</div>
              </div>
              {target && <span className="goto">Go to {target.tab} →</span>}
            </div>
          );
        })
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-title">Rules applied</div>
        <ul className="muted rules-list">
          <li><span className="mono">naming/kebab-case</span> — lowercase words joined by single hyphens.</li>
          <li><span className="mono">naming/duplicate-name</span> — each token name declared once.</li>
          <li><span className="mono">reference/missing-target</span> — aliases point at existing tokens.</li>
          <li><span className="mono">reference/cycle</span> — aliases never loop.</li>
          <li><span className="mono">reference/deep-chain</span> — alias chains stay ≤ {DEFAULT_LINT_CONFIG.maxAliasDepth} hops.</li>
          <li><span className="mono">assignment/prefer-alias</span> — semantic tokens reference primitives.</li>
          <li><span className="mono">duplicate/identical-value</span> — flags shared literals.</li>
          <li><span className="mono">duplicate/near-color</span> — flags perceptually near-identical colors.</li>
        </ul>
      </div>
    </div>
  );
}
