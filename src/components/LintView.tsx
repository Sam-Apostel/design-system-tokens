import { useMemo } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { lint, summarize, DEFAULT_LINT_CONFIG, type LintIssue } from "../lib/lint";
import { tabForIssue } from "../lib/issueNav";
import { duplicateValueGroups, duplicateSummary, type DuplicateGroup } from "../lib/duplicates";
import { parseColor, toCssDisplay } from "../lib/color";

export function LintView() {
  const { tokens, byName } = useStore();
  const { navigate } = useNav();
  const issues = useMemo(() => lint(tokens, DEFAULT_LINT_CONFIG), [tokens]);
  const counts = summarize(issues);
  const dupGroups = useMemo(() => duplicateValueGroups(tokens, byName), [tokens, byName]);
  const dupStats = duplicateSummary(dupGroups);

  const targetFor = (i: LintIssue) => {
    if (!i.tokens[0]) return null;
    return { tab: tabForIssue(i, byName), token: i.tokens[0] };
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
          const target = targetFor(i);
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

      <div className="card dup-section" style={{ marginTop: 16 }}>
        <div className="section-title">
          Shared values <span className="count">({dupGroups.length})</span>
        </div>
        {dupGroups.length === 0 ? (
          <div className="empty">No value is shared by two or more tokens.</div>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {dupStats.redundantNames} tokens collapse to {dupGroups.length} distinct value{dupGroups.length === 1 ? "" : "s"}.
              Groups marked <span className="dup-tag warn">redundant</span> have two or more tokens that independently
              hard-code the same literal — candidates to point at one primitive via <span className="mono">var()</span>.
              Exact values only (no fuzzy color matching). Click a name to open the token.
            </p>
            {dupGroups.map((g) => (
              <DupGroupCard key={g.normalizedValue} g={g} onOpen={(name) => navigate("tokens", name)} />
            ))}
          </>
        )}
      </div>

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
          <li><span className="mono">contrast/insufficient</span> — text-on-surface pairs below WCAG AA (4.5:1).</li>
        </ul>
      </div>
    </div>
  );
}

function DupGroupCard({ g, onOpen }: { g: DuplicateGroup; onOpen: (name: string) => void }) {
  const rgb = g.kind === "color" ? parseColor(g.value) : null;
  return (
    <div className={`dup-group ${g.trivial ? "trivial" : ""}`}>
      <div className="dup-group-head">
        {rgb ? (
          <span className="dup-swatch" style={{ background: toCssDisplay(rgb) }} />
        ) : (
          <span className="dup-swatch glyph">{"{ }"}</span>
        )}
        <span className="dup-value mono" title={g.value}>{g.value}</span>
        <span className="count">×{g.tokens.length}</span>
        {!g.allAlias && !g.trivial && <span className="dup-tag warn">redundant</span>}
        {g.allAlias && <span className="dup-tag" title="One literal, the rest alias it — expected.">aliases</span>}
        {g.trivial && <span className="dup-tag muted">trivial</span>}
      </div>
      <div className="dup-names">
        {g.tokens.map((t) => (
          <button key={t.id} className="chip-btn mono" onClick={() => onOpen(t.name)} title={`Open --${t.name}`}>
            --{t.name}
            {t.value.kind === "ref" ? <span className="dup-alias-mark"> →</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
