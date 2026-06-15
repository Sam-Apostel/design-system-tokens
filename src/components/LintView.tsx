import { useMemo } from "react";
import { useStore } from "../store";
import { lint, summarize, DEFAULT_LINT_CONFIG } from "../lib/lint";

/** Naming / assignment / duplication checks over the whole token set. */
export function LintView() {
  const { tokens } = useStore();
  const issues = useMemo(() => lint(tokens, DEFAULT_LINT_CONFIG), [tokens]);
  const counts = summarize(issues);

  return (
    <div>
      <div className="section-title">Checks &amp; conventions</div>

      <div className="pill-summary">
        <span className="pill">
          <span className="sev error">err</span> <b>{counts.error}</b>
        </span>
        <span className="pill">
          <span className="sev warning">warn</span> <b>{counts.warning}</b>
        </span>
        <span className="pill">
          <span className="sev info">info</span> <b>{counts.info}</b>
        </span>
      </div>

      <div className="card">
        <div className="section-title">Rules applied</div>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 13 }}>
          <li><span className="mono">naming/kebab-case</span> — names are lowercase words joined by single hyphens.</li>
          <li><span className="mono">naming/duplicate-name</span> — each token name is declared once.</li>
          <li><span className="mono">reference/missing-target</span> — aliases point at tokens that exist.</li>
          <li><span className="mono">reference/cycle</span> — aliases never form a loop.</li>
          <li><span className="mono">reference/deep-chain</span> — alias chains stay ≤ {DEFAULT_LINT_CONFIG.maxAliasDepth} hops.</li>
          <li><span className="mono">assignment/prefer-alias</span> — semantic tokens reference primitives instead of hard-coding values.</li>
          <li><span className="mono">duplicate/identical-value</span> — flags tokens sharing the exact same literal.</li>
          <li><span className="mono">duplicate/near-color</span> — flags perceptually near-identical colors (OKLab).</li>
        </ul>
      </div>

      {issues.length === 0 ? (
        <div className="empty">✓ No issues found. Tidy token set!</div>
      ) : (
        issues.map((i) => (
          <div className="issue" key={i.id}>
            <span className={`sev ${i.severity}`}>{i.severity}</span>
            <div className="body">
              <div className="rule">{i.rule}</div>
              <div className="msg">{i.message}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
