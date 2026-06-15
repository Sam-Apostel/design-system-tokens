import { useMemo } from "react";
import { useStore } from "../store";
import { valueToCss } from "../lib/value";

/**
 * Live previews of common components rendered from the imported tokens. The
 * token set is injected as CSS variables scoped to the preview, and the samples
 * read them through fallback chains so they work whether the user uses the
 * Token Studio contract names (surface/text/…), shadcn names (card/foreground/…)
 * or neither. Reflects the active mode.
 */
export function ComponentsView() {
  const { tokens } = useStore();
  const vars = useMemo(
    () => tokens.map((t) => `--${t.name}: ${valueToCss(t.value)};`).join("\n"),
    [tokens],
  );

  if (tokens.length === 0) {
    return <div className="empty">Import tokens to preview components.</div>;
  }

  return (
    <div>
      <div className="section-title">
        Components <span className="count">live preview from your tokens (active mode)</span>
      </div>
      <style>{`.component-preview{${vars}}`}</style>

      <div className="component-preview">
        <section>
          <div className="cp-h">Buttons</div>
          <div className="cp-row">
            <button className="cp-btn cp-btn--primary">Primary</button>
            <button className="cp-btn cp-btn--secondary">Secondary</button>
            <button className="cp-btn cp-btn--outline">Outline</button>
            <button className="cp-btn cp-btn--ghost">Ghost</button>
            <button className="cp-btn cp-btn--destructive">Delete</button>
            <button className="cp-btn cp-btn--primary" disabled>
              Disabled
            </button>
          </div>
        </section>

        <section>
          <div className="cp-h">Badges</div>
          <div className="cp-row">
            <span className="cp-badge cp-badge--default">Default</span>
            <span className="cp-badge cp-badge--secondary">Secondary</span>
            <span className="cp-badge cp-badge--outline">Outline</span>
            <span className="cp-badge cp-badge--destructive">Destructive</span>
          </div>
        </section>

        <section className="cp-grid">
          {/* Card composition */}
          <div className="cp-card">
            <div className="cp-card-title">Create project</div>
            <div className="cp-card-desc">Deploy your new project in one click.</div>
            <div className="cp-field" style={{ marginTop: 16 }}>
              <label>Name</label>
              <input className="cp-input" placeholder="Acme Inc." defaultValue="" />
              <div className="cp-help">This is your project's display name.</div>
            </div>
            <div className="cp-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="cp-btn cp-btn--ghost">Cancel</button>
              <button className="cp-btn cp-btn--primary">Deploy</button>
            </div>
          </div>

          {/* Alerts */}
          <div className="cp-stack">
            <div className="cp-alert cp-alert--info">
              <span className="cp-alert-dot" />
              <div>
                <strong>Heads up</strong>
                <div className="cp-alert-body">You can customize tokens anytime.</div>
              </div>
            </div>
            <div className="cp-alert cp-alert--success">
              <span className="cp-alert-dot" />
              <div>
                <strong>Saved</strong>
                <div className="cp-alert-body">Your changes were applied.</div>
              </div>
            </div>
            <div className="cp-alert cp-alert--warning">
              <span className="cp-alert-dot" />
              <div>
                <strong>Check usage</strong>
                <div className="cp-alert-body">Approaching your plan limit.</div>
              </div>
            </div>
            <div className="cp-alert cp-alert--destructive">
              <span className="cp-alert-dot" />
              <div>
                <strong>Failed</strong>
                <div className="cp-alert-body">Something went wrong. Try again.</div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="cp-h">Typography</div>
          <div className="cp-type">
            <div className="cp-type-row">
              <span className="cp-type-tag">display</span>
              <p className="cp-display">The quick brown fox</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">title</span>
              <p className="cp-title">The quick brown fox</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">heading</span>
              <p className="cp-heading">The quick brown fox</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">subheading</span>
              <p className="cp-subheading">The quick brown fox</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">body</span>
              <p className="cp-body">The quick brown fox jumps over the lazy dog.</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">body-sm</span>
              <p className="cp-body-sm">The quick brown fox jumps over the lazy dog.</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">label</span>
              <p className="cp-label">Form label</p>
            </div>
            <div className="cp-type-row">
              <span className="cp-type-tag">caption</span>
              <p className="cp-caption">Secondary helper text</p>
            </div>
          </div>
        </section>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        Samples read your tokens (contract or shadcn names) via fallbacks. The more of the semantic
        layer you define, the closer this matches your real UI.
      </p>
    </div>
  );
}
