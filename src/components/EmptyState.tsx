import { useStore } from "../store";
import { SAMPLE_CSS } from "../lib/sample";

const EXAMPLE = `:root {
  /* base palette (primitives) */
  --colors-blue-500: #3b82f6;
  --colors-gray-900: #111827;

  /* semantic layer (aliases) */
  --color-brand: var(--colors-blue-500);
  --color-text: var(--colors-gray-900);

  /* spacing / sizing */
  --gap-gap-m: 0.5rem;
  --radius-radius-s: 0.25rem;

  /* typography */
  --font-size-lg: 20px;
  --font-weight-bold: 700;
}`;

export function EmptyState({ onImport, onGenerate }: { onImport: () => void; onGenerate: () => void }) {
  const { dispatch } = useStore();

  return (
    <div className="content">
      <div className="empty-hero">
        <div className="brand" style={{ fontSize: 22 }}>
          <span className="dot" /> Token Studio
        </div>
        <p className="muted" style={{ maxWidth: 560, lineHeight: 1.6 }}>
          Paste your CSS custom properties and Token Studio organizes them into groups
          and layers, then lets you edit, relink, visualize and lint them — all in the
          browser. Or build a scale from scratch. Your work is auto-saved locally;
          nothing is ever uploaded to a server.
        </p>

        <div className="empty-actions">
          <button className="btn primary" onClick={onImport}>
            Import CSS
          </button>
          <button className="btn" onClick={onGenerate}>
            Generate a scale
          </button>
          <button className="btn" onClick={() => dispatch({ type: "load", css: SAMPLE_CSS })}>
            Load example tokens
          </button>
        </div>

        <div className="card" style={{ maxWidth: 620, textAlign: "left", marginTop: 8 }}>
          <div className="section-title">Expected input</div>
          <p className="hint" style={{ marginTop: 0 }}>
            Any CSS containing <span className="mono">--name: value;</span> declarations.
            Values can be literals or <span className="mono">var(--other)</span> aliases.
            Naming with hyphens drives the grouping (e.g. <span className="mono">colors-blue-500</span>).
          </p>
          <pre className="code-block">{EXAMPLE}</pre>
        </div>
      </div>
    </div>
  );
}
