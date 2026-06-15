import { useMemo, useState } from "react";
import { useStore } from "../store";
import { toCss } from "../lib/serialize";

export function ExportModal({ onClose }: { onClose: () => void }) {
  const { tokens } = useStore();
  const [selector, setSelector] = useState(":root");
  const [grouped, setGrouped] = useState(true);
  const [copied, setCopied] = useState(false);

  const css = useMemo(
    () => toCss(tokens, { selector, groupBySection: grouped }),
    [tokens, selector, grouped],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the textarea is selectable as fallback */
    }
  };

  const download = () => {
    const blob = new Blob([css], { type: "text/css" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tokens.css";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Export CSS</h3>
          <div className="spacer" />
          <button className="btn ghost small" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="body">
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
            <div className="field" style={{ flex: "0 0 220px" }}>
              <label>Selector</label>
              <input value={selector} onChange={(e) => setSelector(e.target.value)} spellCheck={false} />
            </div>
            <label className="toggle" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
              Group with section comments
            </label>
          </div>
          <textarea readOnly value={css} spellCheck={false} onFocus={(e) => e.target.select()} />
        </div>
        <footer>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn" onClick={download}>
            Download .css
          </button>
          <button className="btn primary" onClick={copy}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
        </footer>
      </div>
    </div>
  );
}
