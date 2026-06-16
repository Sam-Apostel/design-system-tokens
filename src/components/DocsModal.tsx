import { useEscapeClose } from "../lib/useEscapeClose";

/** Conceptual guide to a tiered token approach. Pure content, no state. */
export function DocsModal({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>How design tokens work</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </header>
        <div className="body docs">
          <p>
            Design tokens are named values that capture design decisions. They work best in <b>tiers</b>,
            where each tier references the one below it, so a single change ripples predictably.
          </p>

          <h4>1 · Primitives (the palette)</h4>
          <p>
            Raw, context-free values: color ramps and a spacing scale. They describe <i>what a value is</i>,
            not where it's used. Names are descriptive, not meaningful.
          </p>
          <pre className="code-block">{`--colors-blue-500: #3b82f6;
--colors-gray-900: #111827;
--space-4: 1rem;
--radius-2: 0.5rem;`}</pre>

          <h4>2 · Semantic tokens (meaning)</h4>
          <p>
            Give primitives a job by <b>aliasing</b> them. Names describe intent — <span className="mono">surface</span>,{" "}
            <span className="mono">text</span>, <span className="mono">border</span>, <span className="mono">primary</span> —
            so swapping the underlying primitive (or theming) only touches this layer.
          </p>
          <pre className="code-block">{`--surface: var(--colors-gray-50);
--surface-raised: var(--colors-white);
--text: var(--colors-gray-900);
--text-muted: var(--colors-gray-500);
--border: var(--colors-gray-200);
--primary: var(--colors-blue-500);`}</pre>

          <h4>3 · Component tokens (scope)</h4>
          <p>
            Component-specific tokens reference semantics. They let one component change without affecting
            others, and document a component's anatomy.
          </p>
          <pre className="code-block">{`--card-bg: var(--surface-raised);
--card-border: var(--border);
--card-radius: var(--radius-2);
--control-bg: var(--surface);
--control-radius: var(--radius-1);
--control-height: var(--space-8);`}</pre>

          <h4>Rules of thumb</h4>
          <ul className="rules-list">
            <li>Product code consumes <b>semantic &amp; component</b> tokens — never raw primitives.</li>
            <li>Each tier only references the tier below it; avoid deep alias chains (≤ 3 hops).</li>
            <li>Pair tokens: a surface usually needs a matching <span className="mono">text-*</span> and <span className="mono">border-*</span>.</li>
            <li>Name by intent (<span className="mono">text-muted</span>), not by value (<span className="mono">gray-500</span>).</li>
            <li>Check contrast for every text-on-surface pairing.</li>
          </ul>

          <p className="hint">
            The <b>Semantics</b> tab shows your current coverage and lets you create these tokens by
            aliasing the primitives your designer already provided.
          </p>

          <h4>Typography</h4>
          <p>
            Type uses the same tiers. <b>Primitives</b> are the raw scales — font families, a modular
            size scale, weights, line-heights and tracking. Describe values, not roles.
          </p>
          <pre className="code-block">{`--font-family-sans: "Inter", system-ui, sans-serif;
--font-size-sm: 14px;   --font-size-md: 16px;
--font-size-lg: 20px;   --font-size-xl: 28px;
--font-weight-regular: 400;  --font-weight-bold: 700;
--line-height-tight: 1.2;    --line-height-normal: 1.5;`}</pre>
          <p>
            A <b>text style</b> is a semantic group: several tokens sharing a name prefix
            (<span className="mono">text-heading-*</span>) that together define one role — size, weight,
            line-height, tracking and an optional <b>color</b>. Alias the size/weight to primitives so the
            scale stays consistent, and alias the <span className="mono">-color</span> to a semantic color
            (e.g. <span className="mono">--text</span>) so it follows theme &amp; mode.
          </p>
          <pre className="code-block">{`--text-heading-font-size: var(--font-size-xl);
--text-heading-font-weight: var(--font-weight-bold);
--text-heading-line-height: var(--line-height-tight);
--text-heading-letter-spacing: -0.02em;
--text-heading-color: var(--text);`}</pre>
          <p className="hint">
            The <b>Typography</b> tab previews every style live; <b>+ New text style</b> scaffolds one of
            these grouped sets for you — including the optional text color, which you can alias to a color
            token so it tracks your theme.
          </p>

          <h4>Theme Token Studio with your own tokens</h4>
          <p>
            Token Studio reads a small <b>theming contract</b> — if your set defines these semantic color
            tokens, the app's UI re-skins itself to match (and toggling light/dark re-skins it live). It's
            the same app, dogfooding the same tokens.
          </p>
          <pre className="code-block">{`--background      → app background
--surface        → panels & cards
--surface-raised → raised / hover surfaces
--text           → text        --text-muted → muted text
--text-subtle    → subtle text --border     → borders
--color-primary  → accent      (or: primary / brand)
--success  --warning  --danger  --info → status colors`}</pre>
          <p className="hint">
            Aliases count too — these usually point at your primitives. Build the recommended semantic
            layer and you get the theming for free.
          </p>
        </div>
        <footer>
          <button className="btn primary" onClick={onClose}>Got it</button>
        </footer>
      </div>
    </div>
  );
}
